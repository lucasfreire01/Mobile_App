# Provedores VPN substituíveis — 2026-10-30

- Usuário confirmou objetivo 2: trocar/conectar provedores sem reescrever regras do backend; não é automação do primeiro acesso ao equipamento.
- Contrato `app/services/vpn/types.ts`, registro `config/vpn.ts`, resolução/compatibilidade em `app/services/vpn/registry.ts`. Adaptador incluído: `cloud_connexa_provider.ts`. CloudConnexa segue padrão.
- `VPN_PROVIDER` seleciona padrão para novos cadastros; gateway e reserva de IP persistem vínculo original. CRUD, perfil, worker de rotas e compensação/cleanup usam o vínculo, sem fallback para outro fornecedor.
- Migração `1793500000000_bind_vpn_providers` aplicada localmente. Gateway 4 ficou cloudconnexa; IDs e reservas anteriores preservados. Campos cc* mantidos para compatibilidade; outros provedores usam IDs genéricos. Não persistir extras/segredos retornados pelo adaptador.
- Credenciais CloudConnexa opcionais no schema global e exigidas quando seu adaptador é resolvido. Validação do adaptador padrão no boot, sem chamadas à API externa. Novos adaptadores entram por fábrica de código confiável e configuração, não por módulo/payload informado pelo cliente.
- 105 testes em PostgreSQL descartável, lint/TypeScript/build backend e permissões restritas com rollback aprovados. Dois adaptadores simulados exercitaram troca do padrão, vínculo, perfis, rotas e falhas/limpeza. Campos extras privados foram filtrados.
- Backend reiniciado, saúde ok; login/lista/detalhe no app web aprovados, sem exceções JS. Sem provisionar VPN externa ou aplicar configuração no gateway nesta etapa.
- Documentação para registrar adapter: `mobile_vpn/docs/vpn-providers.md`; evidência: `mobile_vpn/docs/vpn-provider-verification.json`.
- Próximo passo depende da escolha do segundo serviço real: implementar adapter específico, credenciais próprias e homologar a API. Interface de perfis aceita OpenVPN/WireGuard; script atual de instalação no gateway continua OpenVPN e precisa de adaptação/validação para outro protocolo.
