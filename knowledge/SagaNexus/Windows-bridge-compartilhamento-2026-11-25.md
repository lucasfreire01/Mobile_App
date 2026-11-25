# Instalador Windows e compartilhamento — 2026-11-25

- Corrigido `scripts/install_gateway_bridge_windows.ps1`: não há IP fixo de gateway; o instalador identifica a Ethernet e a interface com rota padrão, habilita o ICS via `HNetCfg.HNetShare` e cria regras privadas do Firewall para TCP 8787 e 8800–8863.
- O instalador solicita elevação UAC e aborta com segurança quando a topologia tem mais de uma Ethernet ou rota ambígua.
- Atualizados `scripts/tests/bridge_packages.test.mjs` e `docs/gateway-bridge-windows.md`.
- Teste executado: `node --test scripts/tests/bridge_packages.test.mjs scripts/tests/bridge_installers.test.mjs` — passou; validação PowerShell/ICS/Firewall nativos e gateway físico ainda não foram executados neste Linux.
