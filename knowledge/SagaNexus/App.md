# App

SagaNexus é um app interno Android/iOS para configurar gateways Browan Pico Next Indoor remotamente. Raiz: `mobile_vpn_app/`.

- Telas: `src/app/login.tsx`, `gateways.tsx`, `gateways/new.tsx`,
  `users/new.tsx`, `gateways/[id].tsx`, `gateways/[id]/operations.tsx`.
- Autenticação: `src/auth/auth-context.tsx`; API: `src/config/api.ts`.
- Catálogo de gateways: busca local por nome/IP na lista; rotas operacionais
  protegidas no Expo Router e no backend. Gestão de gateway/usuário exige admin.
- Direção visual iterada para console de rede: trilha SagaNexus–rede–gateway,
  inventário e histórico em linhas de nós; estados sempre vêm do backend.
- Login simplificado: logo, título, e-mail, senha e ação de entrar; sem selos,
  numeração ou grafismos decorativos.
- Componentes: `src/components/`; tokens: `tailwind.config.js`.
- Logo oficial: `assets/branding/` — preservar.
- Identidade escolhida: Rede em movimento, cabeçalho azul profundo e superfície clara.
- Contexto de produto: `PRODUCT.md` na raiz do workspace; design atual: `DESIGN.md` na raiz.

Prévia web usada: localhost:8082; backend: localhost:3333. São endereços conhecidos, não garantia de processos ativos.
Capturas web não comprovam funcionamento nativo em dispositivos.

Ver [[Decisoes]], [[Estado]].

## Validação web em 2026-10-30

Expo Web em http://localhost:8081, API real local. Login com usuário de desenvolvimento configurado; listagem e detalhe do gateway 4 carregaram com HTTP 200. Tela exibiu ONLINE, gerenciamento/WAN 10.42.0.126 e Ethernet estática. Botão Atualizar consultou novamente detalhe, Ethernet, operações e alertas com HTTP 200. Sem exceções JS observadas; viewport 390px sem overflow horizontal; conferência visual também em 1440px. Sem mudanças no código do app. Evidência: `mobile_vpn/docs/gateway-app-web-verification.json`. A atualização automática da tela ocorre durante operação pending/applying; atualização comum foi validada pelo botão. Não valida Android/iOS nativos nem transição online/offline.

Transição ONLINE → OFFLINE → ONLINE validada com atualização manual da tela em 2026-10-30; ver [[Validacao-Transicao-2026-10-30]]. Testes nativos continuam pendentes.

## Lista paginada em 2026-10-30

Ver [[Paginacao-2026-10-30]]: páginas de 20 com Anterior/Próxima; busca/filtro de status no servidor, debounce e cancelamento de requisições antigas; totais globais. Browser validado com 23 fixtures em banco isolado e gateway real após reiniciar backend. Sem mudanças em autenticação, rotas ou provisionamento.

## Patches de dependências em 2026-10-30

Expo 58.0.21, constants 58.0.14, linking 58.0.15, router 58.0.28 e React Native 0.88.1; compatibilidade online, lint/TypeScript, web real e bundle Android aprovados. Advisories de tooling persistem; ver [[Dependencias-2026-10-30]].
