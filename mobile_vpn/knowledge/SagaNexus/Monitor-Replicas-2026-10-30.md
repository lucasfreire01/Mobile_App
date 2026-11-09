# Monitor entre réplicas — 2026-10-30

- Implementado `app/services/gateway_monitor_lease_service.ts`, integrado ao `GatewayStatusJob`; concessão PostgreSQL por token com validade e cursor compartilhado. Donos antigos não publicam nem liberam o sucessor; transações curtas, sem prender banco durante SSH.
- Concessão: orçamento do ciclo + 30s, padrão 130s. Queda recupera após vencimento no próximo tick. Cursor persistido antes do despacho, avanço monotônico e reset ao final; perda de posse cancela sondagens. Não usa a trava de alterações de rede.
- Migração `1793400000000_create_gateway_monitor_state` aplicada no laboratório. Papel de execução recebeu só SELECT/INSERT/UPDATE na tabela nova. Allowlist de grants e verificação de permissões atualizadas, sem DDL nem rotação de credenciais.
- Verificação: 96 testes em banco descartável, lint/TypeScript/build backend aprovados. Teste de permissões com rollback aprovado.
- Duas APIs reais simultâneas com banco compartilhado: uma checked=1/online, outra skipped=true/checked=0; sem erros de escrita ou perda de posse. Gateway 4 online e WAN observada. API extra encerrada e verificada; principal mantida saudável em http://127.0.0.1:3333.
- Evidência: `mobile_vpn/docs/gateway-monitor-replicas-verification.json`; detalhes e implantação: `mobile_vpn/docs/gateway-status-monitor.md`.
- Produção não validada: migrar, aplicar grants e substituir todos os monitores antigos; versões antigas ignoram concessão. Exclusão exige banco compartilhado e concessão válida; resultados de processo suspenso além da validade são rejeitados, sem encerramento remoto do processo.
- Continuam pendentes os advisories upstream e a execução física Android/iOS adiada pelo usuário; não declarar produto pronto para produção.
