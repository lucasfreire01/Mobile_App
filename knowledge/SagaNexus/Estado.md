# Estado

Atualizado em 2026-10-29. Este snapshot mantém a API na raiz do repositório;
resultados de testes do checkout antigo com backend em `mobile_vpn/` são
históricos e não comprovam o estado atual da API.

- App: login simplificado, cadastro e busca de gateways, cadastro de usuários,
  configuração Ethernet e acompanhamento de operações.
- `npm run lint` e `npx tsc --noEmit` passaram no app antes da cópia para esta
  branch. A prévia headless ficou branca; validação visual em Android/iOS segue
  pendente.
- Esta publicação altera o app e sua documentação. A API deve ser verificada
  diretamente na raiz antes de qualquer afirmação de prontidão.

Ver [[Backend]], [[Testes]], [[Decisoes]].
