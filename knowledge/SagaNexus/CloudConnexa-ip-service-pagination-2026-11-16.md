# CloudConnexa: descoberta do IP service

- Causa: `findExistingGatewayResources` usava `pageSize=100`, mas a API retorna o conteúdo correto com `size=100`.
- Correção: consulta agora usa `GET /api/v1/networks/ip-services?page=1&size=100`.
- Regressão: `cloud_connexa_service.spec.ts` valida `content`, `routes[].subnet`, `networkItemId`, GET da rede e ausência de POST.
- Validação: `npm run typecheck` passou; teste direcionado não iniciou por `uv_interface_addresses` no runner Adonis; nenhuma chamada real foi feita.
