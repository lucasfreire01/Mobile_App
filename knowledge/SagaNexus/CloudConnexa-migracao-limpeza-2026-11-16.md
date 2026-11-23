# Migração CloudConnexa: identidade e limpeza

- Alterados `mobile_vpn/mobile_vpn/app/services/cloud_connexa_service.ts` e `cloud_connexa_migration_service.ts`.
- A identidade não secreta agora inclui base URL, client ID, access group ID e região; a mudança continua invalidando o cache de token.
- Após atualizar todos os gateways para os novos recursos, o backend remove cada `networkId` antigo via `deleteNetwork`.
- Falha na limpeza antiga mantém os novos IDs ativos e registra `reconciliation_required` com os IDs pendentes; não há rollback destrutivo nessa fase.
- Teste adicionado para preservar os novos IDs quando a limpeza antiga falha.
- `npm run typecheck`: passou.
- `npx c8 --all --include app/services/cloud_connexa_service.ts --include app/services/cloud_connexa_migration_service.ts --include tests/unit/cloud_connexa_migration_service.spec.ts node ace test tests/unit/cloud_connexa_migration_service.spec.ts`: não iniciou por `uv_interface_addresses returned Unknown system error 1`; cobertura reportada pelo runner foi 0% porque nenhum teste iniciou.
- Limitações: não houve chamada à CloudConnexa real; a validação de runtime e a cobertura percentual ficam pendentes de um ambiente em que o runner consiga enumerar interfaces de rede e carregar o PostgreSQL de teste.
