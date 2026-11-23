# Runner de migração CloudConnexa — 2026-11-16

- `mobile_vpn/scripts/connexa_migration_preflight.mjs` mantém preflight somente leitura por padrão e adiciona `--apply --gateway-id=25` para transação PostgreSQL explícita, usando `.env` ativo, conta `saganexus2`, vínculos rede/conector/serviço e rollback em erro.
- O runner não foi executado na EC2 e não substitui perfis VPN do gateway; aplicação remota continua pendente de validação dos recursos da conta nova e backup atual.
- Teste: `node --test scripts/tests/connexa_migration_preflight.test.mjs` — passou (1 arquivo, 6 testes). Nenhuma credencial foi registrada.
