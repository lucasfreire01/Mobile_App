# Migração automática CloudConnexa — 2026-11-16

- Implementados `CloudConnexaMigrationService`, identidade não secreta da conta e persistência em `vpn_account_migrations`.
- A migração preserva o `gateway.id`, atualiza recursos CloudConnexa juntos, compensa recursos novos e restaura os IDs locais quando uma etapa falha; a mesma identidade concluída é ignorada.
- Testes adicionados em `tests/unit/cloud_connexa_migration_service.spec.ts`.
- Verificações executadas: `npx eslint ...` e `npm run typecheck` passaram.
- O runner isolado não executou por ausência do `.env` e das credenciais locais do PostgreSQL; não foram criados nem registrados segredos.
