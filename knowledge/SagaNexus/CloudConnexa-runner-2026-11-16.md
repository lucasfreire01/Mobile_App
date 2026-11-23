# CloudConnexa runner — 2026-11-16

- Alterado: `mobile_vpn/app/services/cloud_connexa_migration_runner.ts` adiciona execução assíncrona com guarda de promessa e lock advisory PostgreSQL compartilhado.
- Integrado: `providers/scheduler_provider.ts` dispara a migração no `ready()` sem bloquear o boot e registra sucesso/falha sem segredos.
- Teste: `node ace test tests/unit/cloud_connexa_migration_service.spec.ts tests/unit/cloud_connexa_migration_runner.spec.ts` — passou (código 0).
- Verificação: `npm run typecheck` — passou. Cobertura percentual não foi medida porque `c8` não está instalado.
