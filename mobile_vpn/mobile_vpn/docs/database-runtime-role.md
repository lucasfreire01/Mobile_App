# Papel restrito de banco para API e worker

A API e o worker usam `DB_USER=saganexus_runtime`, sem superuser, CREATEDB,
CREATEROLE, REPLICATION, BYPASSRLS, propriedade de tabelas ou associação a outros
papéis. Não podem criar objetos no schema `public`, consultar o histórico de
migrações nem alterar usuários. Os tokens de acesso continuam podendo ser emitidos,
atualizados e revogados.

O papel administrativo existente não foi removido. Suas credenciais ficam em
`.env.database-admin`; API e worker não carregam esse arquivo. O Compose o usa
somente para inicializar o PostgreSQL. Alterar o usuário da aplicação não muda o
administrador de um volume já existente.

## Matriz de permissões

| Tabela | Permissões do runtime |
|---|---|
| users | SELECT |
| auth_access_tokens | SELECT, INSERT, UPDATE, DELETE |
| gateways | SELECT, INSERT, UPDATE, DELETE |
| gateway_ip_reservations | SELECT, INSERT, UPDATE, DELETE |
| gateway_ethernet_configs | SELECT, INSERT, UPDATE |
| gateway_network_operations | SELECT, INSERT, UPDATE |
| gateway_security_alerts | SELECT, INSERT, UPDATE |
| gateway_ssh_host_key_rotations | SELECT, INSERT |
| worker_heartbeats | SELECT, INSERT, UPDATE |
| gateway_monitor_states | SELECT, INSERT, UPDATE |
| rate_limits | SELECT, INSERT, UPDATE, DELETE |

Somente as sequências das tabelas com INSERT recebem USAGE. Não há concessão
de TRUNCATE, REFERENCES, TRIGGER ou GRANT OPTION. Deletes de gateways continuam
usando os cascades já existentes no banco. Não foram habilitados RLS nem novos
filtros de autorização de produto.

## Instalação local existente

Execute no diretório `mobile_vpn/`, antes de trocar a conexão:

```bash
npm run db:runtime:prepare
npm run db:test-permissions
npm run db:runtime:activate
npm run db:runtime:verify
```

O primeiro `prepare`, quando ainda não há arquivo administrativo, preserva as
credenciais `DB_USER`/`DB_PASSWORD` atuais em `.env.database-admin`. Portanto, nessa
primeira execução elas precisam pertencer ao administrador existente. O script
gera uma senha aleatória, cria o runtime e grava a credencial candidata em
`.env.database-runtime`, sem trocar o `.env` até `activate`.

Os três arquivos privados têm modo 600 e são ignorados pelo Git. Nenhuma senha
é impressa. O arquivo de exemplo administrativo é versionado e contém senha vazia.
O serializador recusa apóstrofos e quebras de linha nas credenciais em vez de
reescrevê-las incorretamente. O runtime gerado usa uma senha aleatória hexadecimal.

Após ativar, reinicie os processos que mantêm conexões abertas: um pool já criado
não troca de identidade só porque o `.env` mudou. Não inicie o worker como teste
se houver operações pendentes: ele aplicaria configurações reais.

`prepare` pode ser repetido após migrações para reconciliar a matriz explícita.
Não rotaciona a senha de um papel existente nem reutiliza um papel encontrado no
cluster sem o arquivo de credenciais candidato. Novas tabelas exigem revisão de
`tablePrivileges` em `scripts/database-roles.mjs`; não há grants globais automáticos.

## Banco novo

1. Copie `.env.example` para `.env` e `.env.database-admin.example` para
   `.env.database-admin`; preencha as demais variáveis e a senha administrativa
   em um editor. Mantenha os dois `DB_DATABASE`/`POSTGRES_DB` correspondentes.
2. Restrinja os arquivos privados com `chmod 600`.
3. Inicie o banco: `docker compose up -d postgres`.
4. Execute as migrações pelo wrapper administrativo abaixo.
5. Execute `prepare`, o teste de permissões e `activate`; depois inicie API/worker.

O usuário indicado em `POSTGRES_USER` é o administrador de bootstrap, nunca o
runtime. Os dados do volume existente não são apagados ou recriados por esses
comandos. Não use `docker compose down -v` para trocar credenciais.

## Migrações e manutenção

```bash
npm run db:admin -- migration:status
npm run db:admin -- migration:run
npm run db:runtime:prepare
```

O wrapper também admite `db:seed` e `user:grant-admin`; a conta runtime não pode
criar/promover usuários. API e worker são recusados pelo wrapper para evitar
executá-los acidentalmente com a credencial administrativa.

Os scripts administrativos são copiados para `build/scripts/` pelo `metaFiles`
do Adonis. Dentro de um build, o mesmo wrapper chama `ace.js`. Ele usa as demais
variáveis do ambiente ou do `.env` da release. O caminho da credencial
administrativa pode ser definido por `DB_ADMIN_ENV_FILE`, sem colocar o segredo
na linha de comando.

Em produção, mantenha o arquivo administrativo fora da release e inacessível ao
usuário de sistema da API/worker. Execute migrações como operador/deploy, com as
variáveis da aplicação disponíveis e `DB_ADMIN_ENV_FILE` apontando para esse
arquivo privado. Os serviços systemd devem receber somente as variáveis runtime
em `/etc/browan/mobile-vpn.env`. Para usar o wrapper sem um `.env` na release,
defina `DB_APP_ENV_FILE` apontando para esse arquivo, com valores literais já
resolvidos. Para reconciliar grants usando uma credencial runtime externa,
defina também `DB_RUNTIME_ENV_FILE` apontando para o arquivo que contém seu
DB_USER/DB_PASSWORD. O operador precisa ter acesso aos dois arquivos; o serviço,
somente ao arquivo runtime. Não copie `.env.database-admin` ou
`.env.database-runtime` para dentro da release ou imagem da aplicação.

No desenvolvimento local, os processos e arquivos pertencem ao mesmo usuário de
sistema. Modo 600 evita leitura por outros usuários, mas não constitui isolamento
entre processos desse mesmo usuário. A separação de papéis do PostgreSQL não
substitui o isolamento de arquivos e usuários de sistema em produção.

## Verificação e evidências

- `npm run db:test-permissions`: teste independente do bootstrap Japa; cria
  gateway/configuração/operação/alerta/heartbeat/limiter sintéticos em transação e
  faz rollback. Verifica que DDL, alteração de usuários e leitura do histórico de
  migrações são negados. Não faz SSH nem inicia workers. Os IDs explícitos
  negativos evitam consumir sequências do banco operacional.
- `npm run db:runtime:verify`: confere os atributos do papel, ausência de
  propriedade/herança administrativa, matriz de tabelas e permissões de sequências.
- [Verificação HTTP local](database-runtime-http-verification.json): login,
  perfil, listagem/detalhes/configuração/históricos, health da fila e logout com
  a nova conexão. O token temporário foi revogado e sua reutilização retornou 401.
- [Estado do papel e validações](database-runtime-role-verification.json).

Nesta mudança não foram executadas migrações reais nem operações nos gateways.
O worker foi validado quanto às permissões de DML/claim/heartbeat em transação;
isso não é prova de aplicação remota nem de saúde de um processo worker em execução.

## Reversão operacional

Se uma regressão exigir reversão, pare API e worker, restaure somente DB_USER e
DB_PASSWORD a partir da credencial administrativa preservada usando um editor
seguro e reinicie. Isso reintroduz temporariamente os privilégios elevados; não
é a configuração recomendada. Não há necessidade de apagar banco, tabelas ou o
novo papel para reverter a conexão.
