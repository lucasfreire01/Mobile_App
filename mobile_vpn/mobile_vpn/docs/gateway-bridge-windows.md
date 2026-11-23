# Ponte SagaNexus para Windows

O instalador Windows x64 é universal e inclui Node.js; o computador de destino não precisa ter Node instalado nem receber credenciais. Em um computador Windows de desenvolvimento com internet, abra PowerShell na pasta `mobile_vpn/mobile_vpn` e monte o EXE:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\scripts\package_gateway_bridge_windows.ps1 $env:TEMP\saganexus-gateway-bridge-windows-x64.exe
```

Será criado um instalador autoextraível `%TEMP%\saganexus-gateway-bridge-windows-x64.exe`. Copie-o para o notebook de produção e execute-o:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
Unblock-File .\saganexus-gateway-bridge-windows-x64.exe
 .\saganexus-gateway-bridge-windows-x64.exe
```

A instalação é por usuário, sem elevação, e registra uma tarefa que inicia a ponte quando esse usuário entra no Windows. A ponte não contém credenciais e detecta as interfaces Wi-Fi e Ethernet pelos nomes, listando os gateways encontrados. O celular e o Wi-Fi do notebook precisam estar na mesma rede local. Se o Firewall do Windows bloquear a descoberta, permita TCP 8787 e TCP 8800–8863 na rede privada.

O cliente OpenSSH do Windows precisa estar instalado, incluindo `ssh.exe` e `ssh-keyscan.exe`; o instalador verifica isso antes de alterar a instalação existente.

Para remover, abra o Agendador de Tarefas, exclua `SagaNexus Gateway Bridge` e remova `%LOCALAPPDATA%\SagaNexus\GatewayBridge`.
