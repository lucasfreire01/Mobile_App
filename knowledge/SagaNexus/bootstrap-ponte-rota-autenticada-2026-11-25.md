# Bootstrap da ponte: grant autenticado

- Alterado `mobile_vpn/start/routes/bridge_pairings.ts`: `POST /api/v1/gateway-bridges` exige autenticação e throttle de provisionamento; ações administrativas permanecem protegidas.
- Atualizado `mobile_vpn/tests/functional/bridge_pairing.spec.ts`: anônimo recebe 401 e usuário não-admin recebe 201 com grant temporário.
- Verificação: `npm run typecheck -- --pretty false` passou. A suíte funcional foi bloqueada antes dos testes pelo ambiente ao consultar interfaces de rede para iniciar o servidor HTTP.
