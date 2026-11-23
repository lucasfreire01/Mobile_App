# Instalador Windows da ponte — 2026-11-23

- Confirmado o fluxo existente em `mobile_vpn/mobile_vpn/scripts/package_gateway_bridge_windows.ps1` e `install_gateway_bridge_windows.ps1`.
- Adicionado preflight no instalador Windows para exigir `ssh.exe` e `ssh-keyscan.exe` antes de alterar arquivos, ACL ou Scheduled Task.
- Empacotador Windows alterado para gerar um único `.exe` autoextraível com IExpress nativo; o EXE executa o mesmo `install.ps1` e a documentação foi atualizada.
- Adicionada regressão em `scripts/tests/bridge_packages.test.mjs` para o preflight, módulos, instalador, `bridge.json`, publicação atômica e ausência de token.
- Testes: `node --test scripts/tests/bridge_installers.test.mjs scripts/tests/bridge_packages.test.mjs` — 12/12 passou; validação anterior da ponte/agente — 24/24 e 4/4 passaram; `npm run typecheck` e `bash -n` passaram.
- Validação nativa do IExpress, PowerShell, OpenSSH, Task Scheduler e Browan físico não foi executada neste Linux.
