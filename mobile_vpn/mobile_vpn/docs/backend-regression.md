# Regressão isolada do backend

Execute a partir de `mobile_vpn/`:

```bash
npm test
```

É necessário ter o PostgreSQL local disponível e a credencial de administração
separada em `.env.database-admin` (ou em `DB_ADMIN_ENV_FILE`). API e worker seguem
usando o papel restrito já configurado em `.env`; nenhuma dessas credenciais é
modificada para executar os testes.

## Isolamento

`scripts/run-isolated-tests.mjs` cria um banco vazio com nome aleatório por
execução, a partir de `template0`, e um papel proprietário exclusivo desse banco.
Esse papel não tem SUPERUSER, CREATEDB, CREATEROLE, REPLICATION ou BYPASSRLS.
Antes de iniciar os testes, o runner verifica que ele não pode consultar a tabela
operacional de gateways. A credencial administrativa não é enviada ao processo
filho; senhas temporárias são geradas em memória e não são persistidas.

O processo de teste recebe seu próprio DB_DATABASE/DB_USER/DB_PASSWORD e sua
própria porta HTTP local. A configuração antiga em `.env.test` não é usada para
escolher a conexão: as variáveis do processo gerado têm precedência. O bootstrap
confere o identificador da execução, o nome do banco, o papel e a identidade real
da conexão **antes** de executar migrações. `node ace test` sem o runner é recusado.
Não há opção de ignorar essa verificação.

O papel de teste precisa criar e remover objetos no seu próprio banco para as
migrações e fixtures; isso não representa os privilégios de runtime. A matriz
restrita da aplicação tem uma verificação independente em `npm run db:test-permissions`.

Os testes usam PostgreSQL real para persistência, locks e concorrência. Os jobs
que aplicam configurações usam dependências SSH/CloudConnexa simuladas; validam
a lógica e os estados sem executar comandos nos equipamentos. Como proteção
adicional, o ambiente de teste recebe caminho de chave inexistente e destino
CloudConnexa local inválido, sem as credenciais externas reais. O scheduler web
não é carregado no ambiente `test`.

A geração de `database/schema.ts` fica desativada somente durante os testes,
evitando que as migrações do banco temporário reescrevam o schema de desenvolvimento.

## Resultado validado

- **85 testes aprovados**, abrangendo autenticação, autorização administrativa,
  expiração/revogação de tokens, rate limiting, endereços e fingerprints SSH,
  histórico/alertas/rotação de chaves, fila, leases, retries, locks concorrentes,
  heartbeat, health, reserva concorrente de IP, compensação de provisionamento
  monitoramento SSH limitado/cancelável e proteções do ambiente de teste.
- `npm run lint`: passou; os 25 erros anteriormente registrados foram corrigidos.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- Execução direta sem marcador de isolamento: bloqueada antes das migrações.
- Filtro sem testes: retorna falha; não é aceito como aprovação.
- Banco e papel temporários removidos ao finalizar os cenários aprovados e o
  cenário de falha testado.

As correções de lint ficaram restritas aos arquivos diagnosticados: formatação,
importação de tipo, eliminação de uma variável sombreada na auditoria de rotação
e separação do await/map na alocação de IP. Não foram alterados contratos da API
nem adicionadas migrações funcionais.

Evidências:

- [Última execução completa](backend-regression-result.json).
- [Casos negativos de segurança do runner](backend-regression-safety.json).
- [Checks e proteção do ambiente operacional](backend-regression-checks.json).

## Uso e diagnóstico de falhas

Filtros do Ace/Japa podem ser passados após `--`, por exemplo:

```bash
npm test -- --files=tests/functional/auth_security.spec.ts
```

Cada execução tem seu próprio banco e papel. Os recursos temporários são
removidos no bloco de finalização, inclusive quando os testes falham. Há timeout
de 180 segundos; SIGINT/SIGTERM são encaminhados ao filho. Uma interrupção
incondicional do processo pai, como SIGKILL ou queda da máquina, não permite
garantir a limpeza; nesse caso, o operador deve conferir os recursos identificados
pelo nome da execução antes de removê-los.

O relatório JSON registra a limpeza. O log em `tmp/isolated-tests-<id>.log` fica
com modo 600 e tem tokens e segredos gerados removidos. O runner exige o resumo
de sucesso do Japa além do exit code, pois falhas de inicialização do Ace podem
retornar zero. Execuções sem testes não passam.

Esta regressão comprova a lógica com banco real e integrações remotas simuladas.
Não comprova instalação/aplicação no Browan físico, conectividade mundial,
capacidade sob carga, ambiente de produção ou saúde de um worker de produção.

A unicidade e a reserva concorrente de IP foram implementadas; consulte
[provisionamento e recuperação](gateway-ip-reservations.md).
