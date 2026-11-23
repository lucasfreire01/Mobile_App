$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$installDir = Join-Path $env:LOCALAPPDATA 'SagaNexus\GatewayBridge'
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

$node = Join-Path $installDir 'node.exe'
$bridge = Join-Path $installDir 'gateway_lan_bridge.ts'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "& ''{0}'' ''{1}''"' -f $node, $bridge
$action = New-ScheduledTaskAction -Execute (Join-Path $PSHOME 'powershell.exe') -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Seconds 10)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
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
