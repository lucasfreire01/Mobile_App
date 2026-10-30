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

## Coordenação do monitor — 2026-10-30

Ver [[Monitor-Replicas-2026-10-30]]: `app/services/gateway_monitor_lease_service.ts`, `app/jobs/gateway_status_job.ts`, migração `1793400000000_create_gateway_monitor_state.ts`. Cursor e posse compartilhados via PostgreSQL; grants mínimos em `scripts/database-roles.mjs` e `scripts/provision-database-runtime.mjs`. Validação local com duas APIs e 96 testes aprovada.

## Camada de provedores VPN — 2026-10-30

Ver [[Provedores-VPN-2026-10-30]]. Registro em `config/vpn.ts`, contrato/adapter/registry em `app/services/vpn/`; provisionamento, perfil, exclusão, rotas e cleanup desacoplados da API CloudConnexa. Migração `1793500000000_bind_vpn_providers` preserva legados e vincula cada gateway/reserva ao seu provedor. 105 testes e checks aprovados; segundo provedor real ainda depende de implementação específica.
