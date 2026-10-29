# Backend

AdonisJS 7, Lucid e PostgreSQL. Raiz: `mobile_vpn/`.

| Assunto | Arquivo relativo à raiz do backend |
|---|---|
| Rotas e autorização | `start/routes.ts`, `app/middleware/admin_middleware.ts` |
| Login e tokens | `app/controllers/access_tokens_controller.ts`, `app/models/user.ts` |
| Criar usuários | `app/controllers/users_controller.ts`, `app/validators/user.ts`; rota auth/admin em `start/routes.ts` |
| Cadastro e IP único | `app/services/gateway_provisioning_service.ts`, `app/controllers/gateways_controller.ts` |
| Alocação do IP | `app/services/gateway_service.ts` |
| Reservas e índice | `database/migrations/1793300000000_reserve_gateway_management_ips.ts` |
| Limpeza pendente | `commands/gateway_provisioning_cleanup.ts` |
| CloudConnexa | `app/services/cloud_connexa_service.ts` |
| SSH e destinos permitidos | `app/services/gateway_ssh_service.ts`, `app/services/gateway_ssh_address_policy.ts` |
| Fila e leases | `app/services/gateway_network_operation_quere_service.ts` |
| Aplicação remota | `app/jobs/gateway_network_config.ts` |
| Monitoramento em lotes e limites SSH | `app/jobs/gateway_status_job.ts`, `docs/gateway-status-monitor.md` |
| Validação do monitor no laboratório | `docs/gateway-monitor-lab-validation.md` |
| Permissões PostgreSQL | `scripts/database-roles.mjs` |

Procurar símbolos no arquivo certo com `rg -n` antes de abrir trechos. Detalhes do provisionamento: `docs/gateway-ip-reservations.md`.

Ver [[Estado]], [[Testes]], [[Decisoes]].
