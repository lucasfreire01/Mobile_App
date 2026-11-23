# CloudConnexa: correção dos testes de migração — 2026-11-16

- Corrigido o mapeamento da atualização SQL de gateways no serviço de migração: atributos do modelo agora são enviados como colunas PostgreSQL snake_case, tanto na migração quanto na restauração.
- Fluxo preservado: transação local, compensação via `deleteNetwork` e estado `reconciliation_required` quando a limpeza remota falha.
- Teste: `npm run typecheck` — passou.
- Teste direcionado: `DB_APP_ENV_FILE=../.env DB_ADMIN_ENV_FILE=../.env.database-admin DB_RUNTIME_ENV_FILE=../.env.database-runtime node scripts/run-isolated-tests.mjs --files tests/unit/cloud_connexa_migration_service.spec.ts` — 3 passaram; banco e papel temporários removidos.
- App mobile não foi alterado.
