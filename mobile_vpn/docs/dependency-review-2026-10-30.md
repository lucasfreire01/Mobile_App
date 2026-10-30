# Revisão de dependências — 2026-10-30

## Resultado

Correções compatíveis aplicadas e verificadas. Remediação parcial: há advisories upstream ainda sem solução compatível adotada. A auditoria não comprova ausência nem presença de exploração remota no produto.

| Projeto | Antes — npm audit | Depois — npm audit |
| --- | --- | --- |
| Backend | 2 baixos, 1 moderado | 2 baixos |
| App | 5 baixos, 3 altos | 5 baixos, 3 altos |

Os totais contam pacotes afetados e seus dependentes, não vulnerabilidades independentes. Os três alertas altos do app derivam de um único advisory de Zod. `npm audit --omit=dev` apresenta os mesmos totais; no app, Expo e seu CLI pertencem à árvore de dependencies. Essa seleção não representa uma análise do conteúdo executável do bundle nativo.

## Alterações aplicadas

- Backend: `qs` transitivo de 6.16.0 para 6.17.1, mantendo a faixa do consumidor (`@japa/api-client → superagent → qs`). Removido o advisory moderado GHSA-6pq8-jhm2-2vcw. Teste local do caso `stringify` com `arrayFormat: comma` e `toString` próprio não chamável passou sem lançar erro.
- App: patches recomendados pela checagem online do próprio SDK: Expo 58.0.19 → 58.0.21; expo-constants 58.0.13 → 58.0.14; expo-linking 58.0.14 → 58.0.15; expo-router 58.0.26 → 58.0.28; React Native 0.88.0 → 0.88.1. SDK 58 preservado. Patches não eliminam os advisories remanescentes.
- Sem `npm audit fix --force`, downgrade de framework ou override que substitua uma dependência por major incompatível.

## Pendências

### deepmerge 4.3.1 — baixo

Advisory: https://github.com/advisories/GHSA-gcqx-w48m-w2h4. Nenhuma versão corrigida publicada na consulta desta data. O npm oferece downgrade incompatível de Lucid/Expo para eliminar a dependência; não aplicado.

Uso localizado no backend: `@adonisjs/lucid/build/src/orm/schema_generator/builder.js`, mesclando regras de geração de schemas. No app: `@expo/config/build/Config.js`, mesclando configuração local e propriedades de plugins. Esses caminhos são de configuração/tooling; a revisão não estabelece exploração remota nem demonstra que todos os demais caminhos sejam inalcançáveis. Acompanhar correção de deepmerge e releases dos consumidores.

### Zod 3.25.76 — alto

Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5. Correção publicada em 4.6.6; último 3.x consultado: 3.25.76. O CLI mais recente compatível (`@expo/cli@58.1.17`) ainda declara `zod: ^3.25.76`.

Uso localizado no CLI: schemas de DevTools e extensões MCP; ESLint também depende de Zod. Não foi encontrado import de Zod nas fontes do app revisadas, mas isso não é prova de ausência de caminhos transitivos. Não foi estabelecida exploração remota do produto. Não foi forçado Zod 4 sobre o contrato 3.x do CLI: a migração tem alterações incompatíveis documentadas em https://zod.dev/v4/changelog. Aguardar release compatível do consumidor ou tratar uma migração validada separadamente. O npm sugere Expo 51.0.39; esse downgrade foi rejeitado por incompatibilidade com o projeto SDK 58.

## Verificação

- Regressão backend: 89 testes aprovados em PostgreSQL descartável. Banco/papel removidos; tabelas operacionais não utilizadas pelos testes.
- TypeScript e lint aprovados nos dois projetos; build backend aprovado.
- `expo install --check` online: dependências atualizadas e compatíveis.
- Após reiniciar Expo: login, inventário e detalhe do gateway real no Chrome; APIs responderam 200/204, sem exceções JS observadas no fluxo final. Viewport 390px sem overflow horizontal.
- Bundle JavaScript Android gerado: HTTP 200. Não é compilação APK nem execução nativa. Teste físico continua adiado pelo usuário.
- O verificador web antigo manipulava o histórico diretamente e não navegou corretamente com os patches; verificação corrigida para usar o botão real da aplicação e repetida com sucesso. Nenhuma alteração de navegação/autenticação no produto foi necessária.

Evidências: `dependency-review-verification.json`, `dependency-web-verification.json`, `dependency-android-bundle-verification.json`, `backend-regression-result.json`.
