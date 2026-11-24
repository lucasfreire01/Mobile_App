# Descoberta automática do IP pela ponte — 2026-11-24

- `scripts/gateway_lan_bridge.ts` passou a calcular a rede usando a máscara real de cada interface IPv4 elegível e refaz essa leitura a cada varredura, acompanhando mudanças de DHCP/interface.
- A sondagem é limitada a 4096 hosts por rede e 8192 candidatos totais; o protocolo de identidade e os túneis existentes foram preservados.
- Testes: `node --test scripts/tests/gateway_lan_bridge.test.mjs` — 1/1; `npm run typecheck` — passou; `git diff --check` — passou.
- Ainda não houve teste físico com Browan nem validação de DHCP real; redes não diretamente presentes nas interfaces locais continuam fora do escopo.
