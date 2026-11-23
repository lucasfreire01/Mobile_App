# Ponte: reconexão — 2026-11-12

- Defeito confirmado em gateway_lan_bridge.ts: gateway removido de devices após perda de Ethernet, mas túnel preservado em tunnels; reconexão no mesmo IP não recriava devices. Porta calculada pelo tamanho do mapa também podia colidir após remoções.
- Correção: fechar/remover túnel perdido e liberar reserva; reservar a primeira porta livre antes de aguardar listen para evitar colisão entre descobertas concorrentes.
- Teste do script real com HTTPS e sockets simulados: `node scripts/tests/gateway_lan_bridge.test.mjs` aprovado. Cobre descoberta concorrente, perda, novo IP reutilizando porta e três reconexões do mesmo IP. Primeira execução bloqueou leitura de interfaces no sandbox; adicionada simulação de interfaces e teste aprovado.
- Ponte local reiniciada com a versão corrigida, sem build do app. Não confundir fonte corrigida com pacotes Windows/Linux antigos: redistribuição dos pacotes ainda pendente.
- Outro achado real no gateway reconectado: Ethernet 10.42.0.126/24 presente, VPN habilitada, nenhuma configuração de enrollment pendente e nenhuma rota padrão na consulta. Queda ao trocar rede ainda exige diagnóstico DHCP/rota antes de novas exclusões/cadastros.
