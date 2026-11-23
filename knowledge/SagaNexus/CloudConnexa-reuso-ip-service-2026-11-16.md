# CloudConnexa: reutilização de IP service existente

- Alterado `mobile_vpn/mobile_vpn/app/services/cloud_connexa_service.ts` para buscar GET paginado em `/api/v1/networks/ip-services` antes dos POSTs.
- Reutiliza somente rota exata `managementIp/32`, `SERVICE_DESTINATION`, `networkItemId`/network válido e connector existente; caso contrário mantém criação normal.
- Testes adicionados em `tests/unit/cloud_connexa_service.spec.ts` para reutilização, segunda página e fallback sem duplicação.
- Validação: `npm run typecheck` e ESLint direcionado passaram.
- Cobertura/teste Adonis não iniciou por `uv_interface_addresses returned Unknown system error 1`; nenhum endpoint real foi chamado.
