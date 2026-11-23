# App: confirmacao online pendente

Gateway 43 confirmou enrollment e posteriormente ficou online; prazo do app de 120s podia vencer antes do monitor periodico. Ajustados src/lib/gateway-pairing.ts e src/app/gateways/new.tsx: prazo apos recibo gera PairingConfirmationPending, renderizado como estado neutro pending; sem mensagem de erro, novo envio bloqueado, retorno a lista permitido. Prazo antes do recibo e falhas reais continuam erros; online so apos API confirmar.

Regressoes atualizadas em gateway-pairing.test.mjs e gateway-pairing-navigation.test.mjs (inclui interface pendente, botao bloqueado, ausencia de alerta e retorno). Testes de pareamento, navegacao e layout passaram; TypeScript e Expo lint passaram. Mudanca precisa ser instalada no APK novo; fluxo fisico ainda requer verificacao nessa versao.
