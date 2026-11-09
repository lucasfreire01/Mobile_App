# Transição do monitor — 2026-10-30

- Validado gateway 4 (`10.42.0.126`) no banco, API autenticada e app web em viewport móvel de 390px: ONLINE → OFFLINE → ONLINE.
- Falha controlada: backend de testes reiniciado com porta SSH 1 somente no ambiente do processo; nenhuma alteração na rede/configuração do equipamento nem no `.env` persistente.
- Monitor real gravou offline, sem erros de escrita; last_seen_at preservado durante falha. Porta SSH original restaurada; novo ciclo gravou online e avançou last_seen_at.
- Tela conferida pelo botão Atualizar em cada etapa; não comprova atualização espontânea do status sem interação nem desligamento físico do gateway.
- API e banco saudáveis ao final; backend restaurado ativo em http://127.0.0.1:3333, app web em http://localhost:8081.
- Evidência: `mobile_vpn/docs/gateway-monitor-transition-verification.json`. Sem exceções JS observadas.
- Testes nativos pendentes: máquina Linux sem Java, ADB, emulador ou SDK Android nas localizações configuradas/padrão. Projetos nativos não gerados. iOS nativo requer ambiente/dispositivo apropriado; nenhuma build nativa foi executada nesta etapa.
