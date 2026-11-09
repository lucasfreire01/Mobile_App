# Paginação de gateways — 2026-10-30

- Implementada em `mobile_vpn/app/controllers/gateways_controller.ts` e `mobile_vpn_app/src/app/gateways.tsx`.
- API: `GET /api/v1/gateways?page=1&limit=20&q=texto&status=online`. Padrão 20, máximo 100, ordem crescente de ID, busca literal sem diferenciar maiúsculas por nome/IP de gerenciamento/WAN; busca limitada a 200 caracteres. Filtro e busca executados antes da paginação.
- Resposta preserva `gatewaysList`, acrescenta `meta` e `summary` global. Lista agora contém somente a página; API e app devem ser publicados de forma coordenada para clientes antigos não receberem inventário truncado.
- App: controles Anterior/Próxima, totais da rede independentes da página, busca com debounce de 300ms, retorno à página 1 ao mudar filtro/busca, cancelamento de requisições anteriores, correção de página quando inventário diminui e atualização manual da página atual.
- Verificação: 89 testes na regressão completa em PostgreSQL descartável; banco e papel removidos, sem usar tabelas operacionais. TypeScript e lint aprovados em backend/app; build backend aprovado.
- Browser integrado com API real e banco isolado contendo 23 gateways: páginas de 20+3 sem sobreposição, próximo/anterior, atualização na página atual, busca além da primeira página, busca WAN, combinação com status e estado vazio. Contadores globais corretos e viewport 390px sem overflow horizontal ou exceções JS observadas.
- Evidência browser: `mobile_vpn/docs/gateway-pagination-web-verification.json`. Encaminhamento temporário das chamadas de lista para API isolada removido ao terminar. Nenhum fixture inserido no laboratório.
- Backend do laboratório reiniciado com versão atualizada; gateway real 4 listado, API/banco saudáveis. Evidência: `mobile_vpn/docs/gateway-pagination-lab-verification.json`.
- App web segue em http://localhost:8081; backend em http://127.0.0.1:3333.
- Usuário adiou o teste físico por falta de cabo; Android/iOS nativos seguem pendentes. Próximas pendências históricas: advisories de dependências e coordenação do monitor entre réplicas.
