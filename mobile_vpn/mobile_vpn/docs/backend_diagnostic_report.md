# Diagnóstico do backend SagaNexus

Data: 29/10/2026. Escopo: checkout local `mobile_vpn/`, AdonisJS 7 e PostgreSQL 17.11.

**Atualização posterior ao snapshot:** SEC-01 foi corrigido no ambiente local:
API ativa com papel restrito, credencial administrativa separada e testes de
permissão/HTTP aprovados. Veja [implementação e limites](database-runtime-role.md).
Os números e atributos do snapshot abaixo são o diagnóstico anterior à correção.
Produção e aplicação remota pelos workers não foram validadas por essa correção.

**Atualização de regressão:** a suíte isolada passou com 64 testes; lint,
TypeScript e build também passaram após corrigir os 25 erros de lint. O estado
abaixo preserva a linha de base histórica. Consulte a [regressão atual](backend-regression.md).

**Atualização DATA-01:** índice único e reserva concorrente de IP implementados
e aplicados localmente; suíte ampliada para 73 testes aprovados. A compensação
agora conserva reservas quando a limpeza falha ou o resultado remoto é incerto.
Veja [fluxo, recuperação e limites](gateway-ip-reservations.md).

## Resultado executivo

As três skills selecionadas estão disponíveis: `supabase-postgres-best-practices` e `nodejs-backend-patterns` foram instaladas; `security-best-practices` já existia e foi preservada. A skill de segurança não tem uma referência específica de AdonisJS: os achados abaixo usam evidência do projeto e documentação oficial, sem transplantar configuração de Express/Fastify.

O banco atual tem **1 gateway, 19 operações e nenhum alerta**. As consultas analisadas executaram em menos de 0,05 ms no servidor nesse conjunto pequeno. O endpoint `/health` teve mediana de **5,244 ms**, p95 de **13,933 ms** e máximo de **39,171 ms** em 20 requisições locais sequenciais. Isso é uma linha de base de desenvolvimento, não uma medição de capacidade, SLA ou desempenho dos endpoints autenticados.

A prioridade de segurança é a conexão configurada da aplicação usar um **superusuário do PostgreSQL**, confirmado ao consultar os atributos da própria credencial. Há também riscos concretos de crescimento: listagem sem paginação, fan-out SSH sem limite, IP de gerenciamento sem unicidade no banco e chamadas CloudConnexa sem deadline explícito da aplicação.

Não houve alteração de controllers, rotas, configuração de runtime, banco, dependências ou dispositivos nesta etapa. Foram acrescentados apenas o script diagnóstico e os relatórios/evidências. As diversas alterações que já existiam no checkout foram preservadas.

## Evidências e método

- [Snapshot PostgreSQL, planos e amostras HTTP](backend-diagnostic-evidence.json).
- [Resumo do audit de dependências](backend-dependency-audit-summary.json).
- [Resultado dos checks](backend-diagnostic-checks.json).
- [Script reproduzível](../scripts/diagnose-backend-readonly.mjs).

O script não inicia Adonis nem seu scheduler. Conecta com `default_transaction_read_only=on`, usa `BEGIN READ ONLY`, limita consultas a 3 segundos e encerra com `ROLLBACK`. `EXPLAIN ANALYZE` foi aplicado somente a SELECTs; a seleção da fila foi analisada sem `FOR UPDATE` e a recuperação de leases foi representada por SELECT, sem efetuar claims, atualizações ou executar workers. Os planos não representam o custo completo dessas transações de escrita.

Nenhuma credencial, token, chave SSH, registro de usuário ou payload de operação foi incluído nas evidências. Não foram feitas chamadas SSH ou mutações na CloudConnexa. Os GETs protegidos foram consultados sem credenciais e responderam 401; não houve criação de conta ou emissão de token.

## Achados priorizados

### SEC-01 — Alta: credencial local da aplicação é superusuário

**Evidência:** `applicationRole` no snapshot confirma `rolsuper`, `rolcreatedb`, `rolcreaterole` e `rolbypassrls` verdadeiros. A aplicação usa as variáveis `DB_*` em [config/database.ts:54](../config/database.ts#L54).

**Impacto:** o comprometimento dessa credencial permite contornar as permissões do banco; o dano potencial ultrapassa as operações necessárias ao app. Isso não demonstra SQL injection nem comprometimento ocorrido.

**Recomendação:** separar papel de migração/administração e papel de runtime, sem superuser, CREATEDB, CREATEROLE ou BYPASSRLS, concedendo somente os acessos necessários às tabelas e sequências. Testar API e worker com esse papel antes de trocar a credencial. Não habilitar RLS automaticamente: o produto atual é interno, com autorização administrativa compartilhada, e não foi definido isolamento multiempresa.

**Limite:** confirmado no ambiente local. A credencial e os privilégios de produção não foram inspecionados.

### DATA-01 — Média: unicidade de IP de gerenciamento depende de uma pré-consulta

**Evidência:** não há índice nem restrição única para `gateways.management_ip_address` nos índices efetivamente instalados. [gateway_service.ts:42](../app/services/gateway_service.ts#L42) verifica disponibilidade com SELECT; [gateways_controller.ts:44](../app/controllers/gateways_controller.ts#L44) faz essa verificação antes de provisionar os recursos externos e gravar o gateway.

**Risco:** duas requisições concorrentes podem aprovar o mesmo IP antes de qualquer INSERT, criando identificação ambígua e recursos externos desnecessários. A ausência de índice também exige varredura para procurar esse endereço conforme a tabela cresce.

**Recomendação:** verificar duplicatas existentes, impor unicidade no banco para o endereço de gerenciamento e tratar a violação como 409. Para alocação automática, reservar o endereço atomicamente e definir compensação para falhas de provisionamento. Não basta adicionar um índice não único, nem manter somente a pré-consulta.

### PERF-01 — Média: listagem de gateways cresce sem limite

**Evidência:** [gateways_controller.ts:27](../app/controllers/gateways_controller.ts#L27) usa `Gateway.all()`. Busca e filtros do app atualmente operam sobre a lista completa recebida.

**Risco:** aumento de leitura, hidratação de models, serialização JSON, tráfego e memória no celular. Com 1 gateway, a execução SQL observada foi 0,009 ms; não há evidência de lentidão atual causada por essa consulta.

**Recomendação:** planejar paginação e busca no servidor com seleção explícita dos campos necessários. Preservar o contrato atual até adaptar o app: paginar unilateralmente faria a busca local ignorar equipamentos de outras páginas. Preferir ordenação estável, com desempate por ID.

### PERF-02 — Média: monitoramento SSH abre trabalho para todos os gateways ao mesmo tempo

**Evidência:** [gateway_status_job.ts:9](../app/jobs/gateway_status_job.ts#L9) carrega todos os gateways e usa `Promise.allSettled(gateways.map(...))`. Cada equipamento pode abrir uma conexão para ping e outra para ler a WAN. [scheduler_provider.ts:31](../providers/scheduler_provider.ts#L31) agenda esse job a cada 2 minutos, imediatamente na inicialização do processo web.

**Risco:** rajadas de conexões e gravações ao crescer a frota; processos web replicados também podem executar suas próprias verificações. A frequência de sobreposição depende do scheduler e da duração dos jobs; não foi demonstrada sobreposição nesta medição.

**Recomendação:** limitar concorrência, ler gateways em lotes, adicionar jitter e executar o agendamento em um processo dedicado ou com coordenação distribuída. Medir duração do ciclo, conexões e falhas antes/depois. Não confundir esse job de monitoramento com a fila já existente para aplicar configurações.

### RES-01 — Média: CloudConnexa sem timeout/cancelamento explícito

**Evidência:** `fetch` de autenticação em [cloud_connexa_service.ts:28](../app/services/cloud_connexa_service.ts#L28) e requisições em [cloud_connexa_service.ts:42](../app/services/cloud_connexa_service.ts#L42) não recebem `signal` nem deadline explícito. Provisionamento, remoção e obtenção de perfil aguardam essa integração.

**Risco:** um upstream lento mantém requisições e operações aguardando além do prazo aceitável pelo app. Não foi medido atraso na CloudConnexa e não se afirma que o transporte não tenha timeouts internos.

**Recomendação:** orçamento de tempo explícito por chamada e operação, cancelamento, erro sanitizado e métricas. Retentativas de POST de provisionamento precisam considerar idempotência e resultado indeterminado; retry automático pode duplicar recursos.

### SEC-02 — Média: limites de consumo não cobrem operações administrativas caras

**Evidência:** [start/limiter.ts:14](../start/limiter.ts#L14) define o limite de login. Nas rotas revisadas, não há throttle equivalente para leituras SSH, provisionamento e emissão de perfil VPN. Elas são protegidas por autenticação e papel administrativo em [start/routes.ts:60](../start/routes.ts#L60).

**Risco:** um cliente administrativo defeituoso ou uma sessão administrativa comprometida pode consumir conexões ou recursos externos em excesso. Não é uma rota SSH aberta a usuários anônimos.

**Recomendação:** limites por usuário, gateway e tipo de ação, em store compartilhado; limites de concorrência no acesso remoto e respostas 429/409 úteis ao app. Manter separadas autenticação, autorização e controle de consumo.

### DEP-01 — Média/Baixa: duas advisories sinalizam três pacotes de produção

`npm audit --omit=dev` retornou 3 pacotes: **1 moderado, 2 baixos, 0 altos e 0 críticos**. `@adonisjs/lucid` é sinalizado pela dependência `deepmerge`, portanto não são três vulnerabilidades independentes.

- `qs`: advisory moderada [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw), associada a `stringify` com `arrayFormat: 'comma'` e objetos especialmente construídos; correção publicada em 6.16.1. Confirmar caminho de uso e atualização compatível.
- `deepmerge`: advisory baixa [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4), sem versão corrigida indicada pela advisory consultada. A sugestão automática do audit envolve downgrade major do Lucid de 22 para 21. Não executar `npm audit fix --force` como correção genérica.

**Limite:** o audit demonstra versões sinalizadas, não explorabilidade efetiva nas rotas do projeto. Dependências de desenvolvimento não entraram nesse levantamento.

## Melhorias a medir antes de implementar

- **Health da fila:** [queue_healths_controller.ts:21](../app/controllers/queue_healths_controller.ts#L21) dispara 8 consultas, incluindo três counts separados por status. Considerar agregação por status e índices para as consultas globais após medir com volume real.
- **Histórico de alertas:** o índice atual `(gateway_id, status, created_at)` ajuda a filtrar por gateway, mas não satisfaz diretamente a ordenação global por `created_at` quando `status` não está fixado. A consulta em [gateway_security_alerts_controller.ts:29](../app/controllers/gateway_security_alerts_controller.ts#L29) não filtra status. Comparar plano com dados representativos antes de acrescentar `(gateway_id, created_at, id)`.
- **Recuperação de leases:** há índice parcial correto para a seleção de pendentes, mas nenhum dedicado a `(status, processing_expires_at)`. Medir a recuperação de expirados antes de adicionar outro índice. Um sequential scan em uma tabela com 19 linhas não demonstra problema.
- **Pool:** Lucid/Knex já faz pooling; não se deve afirmar que o projeto abre uma conexão PostgreSQL por request. Sem configuração específica, o Knex instalado usa min 2, max 10 e aquisição de até 60 segundos. Orçar conexões por processo web/worker antes de mudar isso. Snapshot: 3 conexões no banco, incluindo esta consulta, diante de `max_connections=100`.
- **Observabilidade:** `pg_stat_statements` não está instalado no banco inspecionado. Avaliar habilitação operacional e coleta de latência/volume/erros por endpoint, duração das queries e espera no pool. Não ativar logging indiscriminado de parâmetros ou payloads sensíveis.

## Proteções presentes no código e o que foi verificado

**Confirmado por requisição:** GET sem autenticação para `/api/v1/gateways` e `/api/v1/health/queue` retorna 401. `/health` retorna 200 e verifica conectividade com o banco.

**Implementado, mas sem reexecutar os testes funcionais nesta etapa:**

- Rotas administrativas exigem autenticação e `isAdmin`.
- Registro público não aparece nas rotas ativas.
- Tokens têm expiração de 24 horas em [user.ts:14](../app/models/user.ts#L14).
- Login tem throttle de 10 requisições/minuto; produção força store compartilhado no banco.
- Destinos SSH são IPs literais sujeitos à allowlist CIDR; hostname/DNS não é aceito nessa política.
- SSH exige fingerprint e verifica a chave do host; o token de lock não é serializado pelo model Gateway.
- A fila tem índice único parcial que impede duas operações ativas por gateway, e seleção de trabalho usa `FOR UPDATE SKIP LOCKED`.
- Operações e alertas têm limites de paginação de até 100 itens.

Ausência de CSP/CSRF de site não foi classificada automaticamente como vulnerabilidade de uma API mobile com bearer token. A necessidade depende de como autenticação e superfícies web são expostas.

## Validação e limites

| Verificação | Resultado |
|---|---|
| `npm run typecheck` | Passou |
| `node --check scripts/diagnose-backend-readonly.mjs` | Passou |
| `npm run lint` | 25 erros em 10 arquivos já existentes; detalhes no JSON de checks |
| Diagnóstico PostgreSQL | Concluído em conexão/transação somente leitura |
| `npm audit --omit=dev` | Concluído; exit 1 pelos achados de dependências |
| Testes funcionais | Não reexecutados |
| Carga concorrente / endpoints autenticados | Não medidos |
| Aplicação remota / saúde do worker / gateways físicos | Não executadas nesta etapa |

O bootstrap de testes chama migrações e rollback do banco de teste ([tests/bootstrap.ts:48](../tests/bootstrap.ts#L48)). Para manter este levantamento restrito a leituras, esses testes não foram executados. A existência de testes em `tests/functional/auth_security.spec.ts` não equivale a um resultado atual de aprovação.

O ambiente local está em `development`, escutando em `0.0.0.0`; CORS é aberto nesse modo e erros têm debug habilitado fora de produção. Isso serve ao desenvolvimento local e não demonstra configuração segura de publicação. Produção, proxy/TLS, firewall e acesso externo não foram auditados.

## Ordem recomendada para o próximo trabalho

1. Criar e validar papel de runtime com privilégios mínimos, separado do papel de migração, sem retirar acesso antes dos testes.
2. Preparar banco de teste isolado e executar regressão de autenticação, autorização, SSH e fila; resolver os erros de lint existentes em diffs próprios.
3. Tratar unicidade de gerenciamento, reserva concorrente e compensação dos recursos CloudConnexa.
4. Aplicar deadlines e limites de concorrência/consumo; revisar as dependências sinalizadas sem downgrade incompatível.
5. Planejar paginação com o app e medir endpoints autenticados com volume/carga representativos; então ajustar queries e índices conforme os planos.

Nenhuma dessas correções foi aplicada por este diagnóstico.

## Referências primárias

- [AdonisJS — rate limiting](https://docs.adonisjs.com/guides/security/rate-limiting).
- [PostgreSQL 17 — EXPLAIN](https://www.postgresql.org/docs/17/using-explain.html).
- [PostgreSQL 17 — atributos de papéis](https://www.postgresql.org/docs/17/role-attributes.html).
- [Supabase — skills de PostgreSQL](https://supabase.com/docs/guides/ai-tools/ai-skills).

As sugestões de Node.js foram aplicadas como princípios, preservando AdonisJS, Lucid e Vine. Este documento não propõe migrar de framework nem instalar outro banco.
