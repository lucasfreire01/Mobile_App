# CloudConnexa: correção final de migração — 2026-11-16

- Backend alterado: invalidação do cache de token quando a identidade da conta muda; retomada de migrações `pending`/`failed` com snapshot incremental; estados `reconciliation_required` quando a compensação remota falha; retry periódico do runner a cada 5 minutos.
- Política de recursos antigos: não são removidos automaticamente; a limpeza só deve ocorrer quando houver suporte verificável da API. A compensação usa a exclusão em cascata da rede criada e registra falha explicitamente.
- Teste adicionado: falha de limpeza exige `reconciliation_required` e código `E_CLOUDCONNEXA_RECONCILIATION_REQUIRED`.
- Verificação: `npm run typecheck` passou. Teste direcionado não iniciou por `uv_interface_addresses returned Unknown system error 1` no runner Adonis; cobertura percentual não foi declarada.
