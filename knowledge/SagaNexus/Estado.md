# Estado

Atualizado em 2026-10-29. Orientação histórica: conferir evidências antes de afirmar estado atual.

- Papel PostgreSQL restrito aplicado localmente; administração separada.
- Banco de testes descartável; 85 testes aprovados na última regressão.
- Lint, TypeScript e build aprovados.
- Índice único e reserva concorrente de IP implementados e migrados localmente.
- CloudConnexa simulada nos testes; nenhum provisionamento real validado nesta etapa.
- Falha de limpeza mantém reserva; resultado remoto incerto exige reconciliação.
- Monitor SSH em lotes, até 5 sondagens simultâneas por processo; timeout de 15s
  por sondagem e orçamento de despacho de 100s por ciclo. Retomada por cursor.
- Validação local: scheduler e health ok; 1 gateway continuou offline porque
  `GATEWAY_SSH_ALLOWED_CIDRS` bloqueou o destino antes de SSH. TCP respondeu,
  mas autenticação SSH real ainda não foi validada; ver
  `mobile_vpn/docs/gateway-monitor-lab-validation.md`.
- App: busca por nome/IP existente; formulários de criação de gateway e usuário
  adicionados. Rotas exigem sessão; as operações administrativas exigem admin.

Evidências: `mobile_vpn/docs/gateway-ip-reservations-verification.json`, `mobile_vpn/docs/backend-regression-result.json`.
Monitoramento: `mobile_vpn/docs/gateway-monitor-verification.json`.

Pendências: confirmar a sub-rede de gerenciamento autorizada e repetir a
validação SSH real; paginação coordenada com o app, advisories de dependências e
coordenação do monitoramento entre réplicas; validação nativa Android/iOS e
produção separadas.

Ver [[Backend]], [[Testes]], [[Decisoes]].
