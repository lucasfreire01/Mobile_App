# CloudConnexa IP service — 2026-11-16

- Investigado `POST /api/v1/networks/ip-services?networkId=<novo>` com HTTP 400.
- A documentação oficial confirma o payload usado em `app/services/cloud_connexa_service.ts`: `type: SERVICE_DESTINATION`, `routes: [{ value: '<ip>/32' }]` e `config.serviceTypes`.
- Causa operacional identificada: o backend descartava o corpo de erro upstream, impedindo distinguir validação de campo, estado da rede ou regra da conta. Nenhuma chamada real foi feita nesta correção.
- Alteração: erro upstream agora captura corpo JSON/texto limitado e redige chaves sensíveis; testes unitários cobrem JSON e texto.
- Verificação: `npm run typecheck` passou; ESLint direcionado passou. Testes Adonis não iniciaram por `uv_interface_addresses returned Unknown system error 1`.
