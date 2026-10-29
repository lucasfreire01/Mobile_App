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
