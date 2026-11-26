$ErrorActionPreference = 'Stop'

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $arguments = '-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PSCommandPath
  $process = Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments -Wait -PassThru
  exit $process.ExitCode
}

function Configure-BridgeNetworking {
  try {
    $internet = @(Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction Stop | Sort-Object RouteMetric, InterfaceMetric | Select-Object -First 1 | ForEach-Object { Get-NetAdapter -InterfaceIndex $_.ifIndex -ErrorAction Stop })
    $ethernet = @(Get-NetAdapter -Status Up -Name 'Ethernet*' -ErrorAction SilentlyContinue)
    if ($internet.Count -ne 1 -or $ethernet.Count -ne 1 -or $internet[0].ifIndex -eq $ethernet[0].ifIndex) { throw 'Não foi possível identificar Wi-Fi com rota padrão e Ethernet conectada.' }
    $share = New-Object -ComObject HNetCfg.HNetShare
    $props = @{}
    foreach ($connection in @($share.EnumEveryConnection())) {
      $guid = $share.NetConnectionProps($connection).Guid.ToString().Trim('{}').ToLowerInvariant()
      $props[$guid] = $connection
    }
    $internetGuid = (Get-NetAdapter -InterfaceIndex $internet[0].ifIndex).InterfaceGuid.ToString('B').Trim('{}').ToLowerInvariant()
    $ethernetGuid = $ethernet[0].InterfaceGuid.ToString('B').Trim('{}').ToLowerInvariant()
    if (-not $props.ContainsKey($internetGuid) -or -not $props.ContainsKey($ethernetGuid)) { throw 'Interfaces não disponíveis para ICS.' }
    $share.NetSharingConfiguration($props[$internetGuid]).EnableSharing(0)
    $share.NetSharingConfiguration($props[$ethernetGuid]).EnableSharing(1)
    Write-Output "ICS configurado: $($internet[0].Name) -> $($ethernet[0].Name)"
  } catch { Write-Warning "ICS não foi configurado: $($_.Exception.Message). A ponte continuará sendo instalada." }
  foreach ($rule in @(@{ Name = 'SagaNexus Gateway Bridge Discovery'; Ports = '8787' }, @{ Name = 'SagaNexus Gateway Bridge Pairing'; Ports = '8800-8863' })) {
    Remove-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Ports -Profile Private | Out-Null
  }
}

$source = [IO.Path]::GetFullPath((Split-Path -Parent $PSCommandPath))
$installDir = Join-Path $env:LOCALAPPDATA 'SagaNexus\GatewayBridge'
$installLog = Join-Path $installDir 'bridge.log'
$taskName = 'SagaNexus Gateway Bridge'
$files = @('node.exe', 'gateway_lan_bridge.ts', 'bridge_pairing_relay.ts')
foreach ($command in @('ssh.exe', 'ssh-keyscan.exe')) { if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "OpenSSH obrigatório não encontrado: $command" } }
foreach ($file in $files) { if (-not (Test-Path (Join-Path $source $file) -PathType Leaf)) { throw "Pacote incompleto: $file" } }

New-Item -ItemType Directory -Force -Path $installDir | Out-Null
Add-Content -Path $installLog -Value "`r`n[$(Get-Date -Format o)] Início da instalação. source=$source"
Configure-BridgeNetworking 2>&1 | Add-Content -Path $installLog

$node = Join-Path $installDir 'node.exe'
$bridge = Join-Path $installDir 'gateway_lan_bridge.ts'
Copy-Item (Join-Path $source 'node.exe') $node -Force
Copy-Item (Join-Path $source 'gateway_lan_bridge.ts') $bridge -Force
Copy-Item (Join-Path $source 'bridge_pairing_relay.ts') (Join-Path $installDir 'bridge_pairing_relay.ts') -Force

& $node --version 2>&1 | Add-Content -Path $installLog
if ($LASTEXITCODE -ne 0) { throw "Node não conseguiu iniciar; consulte $installLog" }
Add-Content -Path $installLog -Value "[$(Get-Date -Format o)] Node validado: $node"

$powershell = Join-Path $PSHOME 'powershell.exe'
$command = "& '$node' '$bridge' *>> '$installLog'"
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command `"$command`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Add-Content -Path $installLog -Value "[$(Get-Date -Format o)] Tarefa registrada. node=$node bridge=$bridge"
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 3
$task = Get-ScheduledTask -TaskName $taskName
$info = Get-ScheduledTaskInfo -TaskName $taskName
Add-Content -Path $installLog -Value "[$(Get-Date -Format o)] Tarefa: state=$($task.State) lastResult=$($info.LastTaskResult) lastRun=$($info.LastRunTime)"
if ($info.LastTaskResult -ne 0 -and $task.State -ne 'Running') { throw "A tarefa falhou (LastTaskResult=$($info.LastTaskResult)); consulte $installLog" }
Write-Output "Ponte instalada. Log: $installLog"
