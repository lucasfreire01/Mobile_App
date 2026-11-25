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

A instalação pede elevação uma vez para habilitar o compartilhamento de internet entre a interface com rota padrão e a Ethernet do gateway, além de criar as regras privadas do Firewall para TCP 8787 e TCP 8800–8863. A ponte não contém credenciais nem IP de gateway: ela detecta as interfaces Wi-Fi e Ethernet e varre as sub-redes atuais. O celular e o Wi-Fi do notebook precisam estar na mesma rede local.

O cliente OpenSSH do Windows precisa estar instalado, incluindo `ssh.exe` e `ssh-keyscan.exe`; o instalador verifica isso antes de alterar a instalação existente.

Para remover, abra o Agendador de Tarefas, exclua `SagaNexus Gateway Bridge` e remova `%LOCALAPPDATA%\SagaNexus\GatewayBridge`.
