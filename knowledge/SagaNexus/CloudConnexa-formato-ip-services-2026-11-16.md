# CloudConnexa: formato real de IP services

- Ajustado `findExistingGatewayResources` para ler `content` da resposta paginada.
- A descoberta compara `routes[].subnet` e valida `SERVICE_DESTINATION`.
- O connector é obtido por `GET /api/v1/networks/{networkItemId}` e `connectors[0].id`.
- Teste unitário atualizado para o formato real, sem chamada externa.
- Verificação: `npm run typecheck` passou.
