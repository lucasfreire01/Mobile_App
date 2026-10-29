# Backend

O AdonisJS 7 e o PostgreSQL ficam na raiz do repositório. Contrato HTTP:
`docs/api.md`.

| Assunto | Arquivos para começar |
|---|---|
| Rotas e autenticação | `start/routes.ts`, `app/controllers/access_tokens_controller.ts` |
| Gateways e cadastro de conta | `app/controllers/gateways_controller.ts`, `app/controllers/new_account_controller.ts` |
| Aplicação e fila de rede | `app/jobs/gateway_network_config.ts`, `app/jobs/gateway_network_operations_worker.ts` |
| SSH e chaves de host | `app/services/gateway_ssh_service.ts`, `app/controllers/gateway_ssh_host_keys_controller.ts` |

Use `rg -n` para encontrar símbolos e abra apenas os trechos necessários. Confira
o estado atual do código e dos testes antes de confiar em notas históricas.
Gestão administrativa de usuários deve ser confirmada nas rotas atuais; não há
`users_controller.ts` neste snapshot.

Ver [[Estado]], [[Testes]], [[Decisoes]].
