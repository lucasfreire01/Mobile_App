$ErrorActionPreference = 'Stop'
$version = '24.22.2'
$output = if ($args.Count -gt 0) { $args[0] } else { Join-Path $env:TEMP 'saganexus-gateway-bridge-windows-x64.exe' }
$output = [System.IO.Path]::GetFullPath($output)
if ([System.IO.Path]::GetExtension($output).ToLowerInvariant() -ne '.exe') { throw 'O pacote Windows deve ser um executável .exe.' }
$iexpress = Join-Path $env:WINDIR 'System32\iexpress.exe'
if (-not (Test-Path $iexpress -PathType Leaf)) { throw 'IExpress não encontrado no Windows.' }
$files = @('gateway_lan_bridge.ts', 'bridge_pairing_relay.ts', 'install_gateway_bridge_windows.ps1')
foreach ($file in $files) {
    if (-not (Test-Path (Join-Path $PSScriptRoot $file) -PathType Leaf)) { throw 'Fontes da ponte incompletas.' }
}
$work = Join-Path $env:TEMP ([guid]::NewGuid().ToString())
$pending = $null
$pendingDirectory = $null
$archive = "node-v$version-win-x64.zip"
$base = "https://nodejs.org/dist/v$version"
New-Item -ItemType Directory -Path $work | Out-Null
$sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$workAcl = Get-Acl $work
$workAcl.SetAccessRuleProtection($true, $false)
$workAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
Set-Acl -Path $work -AclObject $workAcl
try {
    $sums = Join-Path $work 'SHASUMS256.txt'
    $zip = Join-Path $work $archive
    Invoke-WebRequest "$base/SHASUMS256.txt" -OutFile $sums
    Invoke-WebRequest "$base/$archive" -OutFile $zip
    $line = (Get-Content $sums | Where-Object { $_ -match "  $([regex]::Escape($archive))$" } | Select-Object -First 1)
    if (-not $line) { throw "Manifesto oficial não contém $archive" }
    $expected = ($line -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw 'SHA-256 do Node não confere com o manifesto oficial.' }

    Expand-Archive $zip (Join-Path $work 'node')
    $package = Join-Path $work 'package'
    New-Item -ItemType Directory -Path $package | Out-Null
    Copy-Item (Join-Path $work "node/node-v$version-win-x64/node.exe") $package
    Copy-Item (Join-Path $PSScriptRoot 'gateway_lan_bridge.ts') $package
    Copy-Item (Join-Path $PSScriptRoot 'bridge_pairing_relay.ts') $package
    Copy-Item (Join-Path $PSScriptRoot 'install_gateway_bridge_windows.ps1') (Join-Path $package 'install.ps1')
    $installCommand = "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -File `"%~dp0install.ps1`"`r`nexit /b %ERRORLEVEL%`r`n"
    Set-Content -Path (Join-Path $package 'install.cmd') -Encoding ASCII -Value $installCommand
    $sed = Join-Path $work 'bridge.sed'
    $sourceFiles = (Get-ChildItem $package -File | ForEach-Object { $_.Name })
    $sedLines = @('[Version]', 'Class=IEXPRESS', 'SEDVersion=3', '[Options]', 'PackagePurpose=InstallApp', 'ShowInstallProgramWindow=1', 'HideExtractAnimation=1', 'UseLongFileName=1', 'InsideCompressed=1', 'CAB_FixedSize=0', 'CAB_ResvCodeSigning=0', 'RebootMode=N', 'InstallPrompt=', 'DisplayLicense=', 'FinishMessage=', "TargetName=$output", 'FriendlyName=SagaNexus Gateway Bridge', 'AppLaunched=install.cmd', 'PostInstallCmd=<None>', 'SourceFiles=SourceFiles', '[SourceFiles]', 'SourceFiles0=' + $package, '[SourceFiles0]')
    foreach ($file in $sourceFiles) { $sedLines += "%FILE_$file%" }
    $sedLines += '[Strings]'
    foreach ($file in $sourceFiles) { $sedLines += "FILE_$file=$file" }
    Set-Content -Path $sed -Encoding ASCII -Value $sedLines
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $output) | Out-Null
    $pendingDirectory = Join-Path (Split-Path -Parent $output) ('.saganexus-bridge-' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $pendingDirectory | Out-Null
    Set-Acl -Path $pendingDirectory -AclObject $workAcl
    $pending = Join-Path $pendingDirectory 'bridge.exe'
    $sedContent = (Get-Content $sed -Raw).Replace("TargetName=$output", "TargetName=$pending")
    Set-Content -Path $sed -Encoding ASCII -Value $sedContent
    & $iexpress /N $sed
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $pending -PathType Leaf)) { throw 'IExpress não conseguiu criar o instalador EXE.' }
    $acl = Get-Acl $pending
    $acl.SetAccessRuleProtection($true, $false)
    $acl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'Allow')))
    Set-Acl -Path $pending -AclObject $acl
    Move-Item $pending $output -Force
    $pending = $null
    Write-Output "Pacote criado: $output"
}
finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
    if ($pending) { Remove-Item $pending -Force -ErrorAction SilentlyContinue }
    if ($pendingDirectory) { Remove-Item $pendingDirectory -Recurse -Force -ErrorAction SilentlyContinue }
}
