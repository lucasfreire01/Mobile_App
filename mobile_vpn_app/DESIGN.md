# Interface SagaNexus

A implementação usa Expo SDK 58, React Native e NativeWind, sem novas dependências de runtime.

## Marca e componentes

- `assets/branding/`: original oficial preservado, logo com margens reduzidas e símbolo S recortado. A preparação dos derivados está descrita no README da pasta.
- `src/components/brand.tsx`: imagem oficial e indicador online/offline com texto e cor.
- `BrandSplash`: logo centralizada sobre fundo branco, entrada de 420 ms com fade e escala. A navegação só monta depois da restauração da sessão e da entrada da imagem. Não há tempo de espera artificial adicional.
- `BrandLoadingOverlay`: modal translúcido reutilizável com apenas o símbolo S. Usa os estados de carregamento, salvamento, aplicação e reconhecimento de alertas. Sai em `finally`, inclusive em falhas.
- `useReducedMotion`: respeita a preferência do navegador e do dispositivo; desativa fade, escala, pulso e rotação quando solicitado.
- `ScreenHeader` e `OperationStatus`: navegação e estados operacionais compartilhados.
- `tailwind.config.js`: azul e verde SagaNexus; tons neutros padrão do Tailwind.

## Revisão visual: console de rede

- Login e operação usam a mesma moldura azul e a logo oficial em sua reserva branca.
- O login apresenta o caminho conceitual SagaNexus → rede → Browan; esse desenho não
  indica conectividade real.
- A lista de gateways e o histórico usam trilhas verticais para ligar cada nó ou
  operação aos seus dados. Endereços e estados permanecem explícitos.
- Estados verdes aparecem somente quando o backend confirma online/aplicado;
  estados em andamento e falha mantêm suas cores próprias.
- Formulários usam rótulos operacionais e campos sublinhados para reduzir a aparência
  de coleções de cartões genéricos.

## Fluxos preservados

| Rota | Fluxo |
| --- | --- |
| `/` | Redireciona conforme a sessão restaurada |
| `/login` | E-mail/senha, validação, erro e entrada |
| `/gateways` | Listagem, busca, filtros, atualização e logout |
| `/gateways/[id]` | Estado do gateway, Ethernet, salvar/aplicar, operação e alertas |
| `/gateways/[id]/operations` | Histórico, atualização e paginação com append |

O armazenamento continua usando `browan.session` para manter as sessões existentes. SecureStore, bearer token, tratamento de 401, métodos, endpoints e payloads da API foram preservados. Rotas autenticadas usam a proteção do Expo Router.

As consultas à API têm limite de 15 segundos, incluindo leitura do corpo. O login mantém o abort de 10 segundos. Requisições duplicadas de carregamento são evitadas. Operações remotas pendentes continuam sendo consultadas a cada 5 segundos em segundo plano, sem modal permanente; uma falha interrompe o polling até a próxima atualização manual. Nenhum loader depende de a operação remota chegar a um estado final.

## Verificação manual

Execute na pasta `mobile_vpn_app`:

```bash
npx tsc --noEmit
npx expo lint
npx expo export --platform web
node --test tests/fetch-with-timeout.test.mjs
npx expo start --web --clear
```

No navegador:

1. Recarregue `/` sem sessão: a splash precede o login. Entre e recarregue uma rota autenticada: a splash precede a área autenticada, preservando a rota.
2. Em DevTools, habilite limitação de rede para observar o S em Atualizar, abrir gateway, salvar/aplicar, reconhecer alerta e Carregar mais no histórico. Confirme que a tela reaparece ao terminar.
3. Simule Offline e clique em Atualizar: a espera termina e o erro permanece visível. Restabeleça a rede e tente novamente.
4. Verifique busca por nome/IP, filtros, edição DHCP/IP estático, fallback, paginação, voltar e logout.
5. Emule `prefers-reduced-motion: reduce`: a logo e o S permanecem estáticos. Confira 390 × 844 e 1440 × 1000, foco, contraste, nomes acessíveis e ausência de cortes.

No celular:

```bash
npx expo start --clear
```

Abra o projeto em um cliente compatível com SDK 58. A URL da API já configurada precisa estar acessível ao aparelho. Encerre e reabra o app para verificar a restauração; puxe as listas para atualizar e repita as ações acima. Ative Reduzir Movimento nas opções de acessibilidade do sistema. A verificação em navegador móvel emulado não substitui um teste em aparelho físico.

As ações Salvar e Aplicar atingem a API configurada ao usar o aplicativo normalmente; use um gateway de teste. Os testes automatizados de interface usam respostas simuladas apenas na sessão isolada do navegador.

## Arquivos alterados nesta entrega

- `app.json`
- `tailwind.config.js`
- `src/app/_layout.tsx`
- `src/app/index.tsx`
- `src/app/login.tsx`
- `src/app/gateways.tsx`
- `src/app/gateways/[id].tsx`
- `src/app/gateways/[id]/operations.tsx`
- `src/auth/auth-context.tsx`
- `src/components/brand.tsx`
- `src/components/brand-splash.tsx`
- `src/components/brand-loading-overlay.tsx`
- `src/components/screen-header.tsx`
- `src/components/operation-status.tsx`
- `src/hooks/use-reduced-motion.ts`
- `src/lib/fetch-with-timeout.ts`
- `assets/branding/saganexus-original.png`
- `assets/branding/saganexus-logo.png`
- `assets/branding/saganexus-symbol.png`
- `assets/branding/README.md`
- `tests/fetch-with-timeout.test.mjs`
- `DESIGN.md`

## Evidência desta validação

- `npx tsc --noEmit`: exit 0.
- `npx expo lint`: exit 0.
- `npx expo export --platform web`: exit 0; saída em `dist/`.
- `node --test tests/fetch-with-timeout.test.mjs`: exit 0.
- Exportação servida em `http://localhost:8123`, Chrome headless com viewports 1440 × 1000 e 390 × 844.
- 22 verificações automatizadas da interface passaram com respostas simuladas, sem exceções de runtime na passagem final.
- Conferidos: tamanho/proporção da logo, centralização da splash, legibilidade, espaçamento, status por texto e cor, dimensões do S, responsividade e ausência de rolagem horizontal.
- Evidências locais de desenvolvimento, ignoradas pelo Git: `.expo/design-review/browser.log`, `.expo/design-review/browser-results.json` e capturas `.png` das quatro telas, splash e overlays.
- A logo original e a cópia preservada têm o mesmo SHA-256.
- Não foi executado teste em aparelho físico nem aplicação de configuração contra o backend real.
