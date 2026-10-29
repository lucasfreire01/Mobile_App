# Testes

Raiz dos comandos: `mobile_vpn/`.

- `npm test`: cria banco e papel temporários, executa suíte e remove ambos.
- `npm run lint`, `npm run typecheck`, `npm run build`: checks normais.
- `npm run db:test-permissions`: DML sintético com rollback; requer grants atuais.
- Evitar execução direta de `node ace test`: bootstrap exige isolamento.

Runner: `scripts/run-isolated-tests.mjs`.
Guard: `tests/support/test_database_guard.ts`.
Concorrência e compensação: `tests/functional/gateway_provisioning.spec.ts`.
Autenticação: `tests/functional/auth_security.spec.ts`.
Fila/SSH: `tests/unit/gateway_network_*`, `tests/unit/gateway_ssh_*`.

Última evidência: `docs/backend-regression-result.json` (85 testes), `docs/gateway-ip-reservations-verification.json`.
Monitoramento: `tests/unit/gateway_status_job.spec.ts`, `tests/unit/gateway_status_probe.spec.ts`.
Não repetir suíte por mera releitura de notas; executar conforme mudança ou falha justificar. Resumir logs; preservar arquivo completo fora do contexto.

Ver [[Backend]], [[Estado]].
