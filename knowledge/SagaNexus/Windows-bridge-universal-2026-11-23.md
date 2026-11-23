# EXE universal da ponte Windows — 2026-11-23

- O empacotador Windows não exige nem inclui `bridge.json`, token ou configuração por conta.
- O instalador instala somente Node e os módulos da ponte; descoberta ocorre sem credenciais.
- Arquivos de uma instalação ativa não são substituídos por configuração do pacote.
- Teste: `node --test mobile_vpn/mobile_vpn/scripts/tests/bridge_packages.test.mjs mobile_vpn/mobile_vpn/scripts/tests/bridge_installers.test.mjs` — 12/12 passou.
- Linux não foi alterado.
