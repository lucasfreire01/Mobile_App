$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
    $process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    exit $process.ExitCode
}

function Configure-BridgeNetworking {
    $ethernet = @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object {
        $_.Status -eq 'Up' -and $_.Name -match 'Ethernet|Local Area Connection'
    })
    $defaultRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop |
        Where-Object { $_.State -eq 'Alive' } | Sort-Object RouteMetric, InterfaceMetric
    $internet = @($defaultRoute | Select-Object -First 1 | ForEach-Object {
        Get-NetAdapter -InterfaceIndex $_.ifIndex -ErrorAction SilentlyContinue
    })
    if ($ethernet.Count -ne 1 -or $internet.Count -ne 1 -or $ethernet[0].ifIndex -eq $internet[0].ifIndex) {
        throw 'Não foi possível identificar com segurança a Ethernet do gateway e a interface com internet. Conecte o gateway por Ethernet e tente novamente.'
    }

    $share = New-Object -ComObject HNetCfg.HNetShare
    $connections = @($share.EnumEveryConnection())
    $props = @{}
    foreach ($connection in $connections) {
        $guid = $share.NetConnectionProps($connection).Guid.ToString().Trim('{}').ToLowerInvariant()
        $props[$guid] = $connection
    }
    $ethernetGuid = (Get-NetAdapter -InterfaceIndex $ethernet[0].ifIndex).InterfaceGuid.ToString('B')
    $internetGuid = (Get-NetAdapter -InterfaceIndex $internet[0].ifIndex).InterfaceGuid.ToString('B')
    $ethernetGuid = $ethernetGuid.Trim('{}').ToLowerInvariant()
    $internetGuid = $internetGuid.Trim('{}').ToLowerInvariant()
    if (-not $props.ContainsKey($ethernetGuid) -or -not $props.ContainsKey($internetGuid)) {
        throw 'O Windows não expôs as interfaces para o compartilhamento de internet.'
    }
    $share.NetSharingConfiguration($props[$internetGuid]).EnableSharing(0)
    $share.NetSharingConfiguration($props[$ethernetGuid]).EnableSharing(1)

    foreach ($rule in @(
        @{ Name = 'SagaNexus Gateway Bridge Discovery'; Ports = '8787' },
        @{ Name = 'SagaNexus Gateway Bridge Tunnels'; Ports = '8800-8863' }
    )) {
        Remove-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Profile Private -Protocol TCP -LocalPort $rule.Ports | Out-Null
    }
}

try {
    Configure-BridgeNetworking
    Write-Output 'Compartilhamento e regras do Firewall configurados.'
}
catch {
    Write-Warning ('Não foi possível configurar automaticamente o compartilhamento/Firewall: {0} A ponte continuará sendo instalada.' -f $_.Exception.Message)
}
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'SagaNexus\GatewayBridge'
$installLog = Join-Path $installDir 'bridge.log'
$requiredCommands = @('ssh.exe', 'ssh-keyscan.exe')
foreach ($command in $requiredCommands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "OpenSSH obrigatório não encontrado: $command. Instale o cliente OpenSSH do Windows e tente novamente."
    }
}
$files = @('node.exe', 'gateway_lan_bridge.ts', 'bridge_pairing_relay.ts')
foreach ($file in $files) {
    if (-not (Test-Path (Join-Path $source $file) -PathType Leaf)) { throw 'Pacote da ponte incompleto.' }
}
$sourceNode = Join-Path $source 'node.exe'

$taskName = 'SagaNexus Gateway Bridge'
$previousTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$previousXml = if ($previousTask) { Export-ScheduledTask -TaskName $taskName } else { $null }
$wasRunning = $previousTask -and $previousTask.State -eq 'Running'
$hadDirectory = Test-Path $installDir -PathType Container
$previousAcl = if ($hadDirectory) { Get-Acl $installDir } else { $null }
$work = Join-Path (Split-Path -Parent $installDir) ('.bridge-install-' + [guid]::NewGuid().ToString())
New-Item -ItemType Directory -Force -Path $work, $installDir | Out-Null
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
foreach ($directory in @($work, $installDir)) {
    $acl = Get-Acl $directory
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl -Path $directory -AclObject $acl
}
$stage = Join-Path $work 'stage'
$backup = Join-Path $work 'backup'
New-Item -ItemType Directory -Path $stage, $backup | Out-Null
$targets = $files
$committing = $false
try {
    foreach ($file in $files) { Copy-Item (Join-Path $source $file) $stage -Force }
    foreach ($file in $targets) {
        $old = Join-Path $installDir $file
        if (Test-Path $old -PathType Leaf) { Copy-Item $old $backup -Force }
    }
    $committing = $true
    if ($previousTask) { Stop-ScheduledTask -TaskName $taskName }
    foreach ($file in $targets) { Move-Item (Join-Path $stage $file) (Join-Path $installDir $file) -Force }
    $acl = Get-Acl $installDir
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    Set-Acl -Path $installDir -AclObject $acl
    foreach ($file in $targets) { Set-Acl -Path (Join-Path $installDir $file) -AclObject $acl }

$node = Join-Path $installDir 'node.exe'
$bridge = Join-Path $installDir 'gateway_lan_bridge.ts'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "& ''{0}'' ''{1}'' *> ''{2}''"' -f $node, $bridge, $installLog
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Seconds 10)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
for ($attempt = 0; $attempt -lt 15; $attempt++) {
    Start-Sleep -Seconds 1
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    $listening = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
    if ($task.State -eq 'Running' -and $listening) { break }
    if ($task.State -eq 'Ready' -and $attempt -ge 3) { throw "A ponte não iniciou. Consulte $installLog" }
}
if (-not (Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) {
    throw "A ponte não abriu a porta 8787. Consulte $installLog"
}
    $committing = $false
}
catch {
    if ($committing) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        foreach ($file in $targets) {
            $old = Join-Path $backup $file
            $target = Join-Path $installDir $file
            if (Test-Path $old -PathType Leaf) { Copy-Item $old $target -Force }
            elseif (Test-Path $target -PathType Leaf) { Remove-Item $target -Force }
        }
        if ($previousXml) { Register-ScheduledTask -TaskName $taskName -Xml $previousXml -Force | Out-Null }
        else { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue }
        if ($wasRunning) { Start-ScheduledTask -TaskName $taskName }
    }
    if ($previousAcl) { Set-Acl -Path $installDir -AclObject $previousAcl }
    throw 'Falha ao instalar a ponte; a instalação anterior foi preservada.'
}
finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output 'Ponte instalada e iniciada para o usuário atual.'
