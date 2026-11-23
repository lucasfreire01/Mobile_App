# Testes

Raiz dos comandos: `mobile_vpn/`.

- `npm test`: cria banco e papel temporários, executa suíte e remove ambos.
- `npm run lint`, `npm run typecheck`, `npm run build`: checks normais.
- `npm run db:test-permissions`: DML sintético com rollback; requer grants atuais.
- Evitar execução direta de `node ace test`: bootstrap exige isolamento.

Runner: `scripts/run-isolated-tests.mjs`.
Guard: `tests/support/test_database_guard.ts`.
Concorrência e compensação: `tests/functional/gateway_provisioning.spec.ts`.
Autenticação: `tests/functional/auth_security.spec.ts`.
Fila/SSH: `tests/unit/gateway_network_*`, `tests/unit/gateway_ssh_*`.

Última evidência: `docs/backend-regression-result.json` (85 testes), `docs/gateway-ip-reservations-verification.json`.
Monitoramento: `tests/unit/gateway_status_job.spec.ts`, `tests/unit/gateway_status_probe.spec.ts`.
Não repetir suíte por mera releitura de notas; executar conforme mudança ou falha justificar. Resumir logs; preservar arquivo completo fora do contexto.

Ver [[Backend]], [[Estado]].

## Regra registrada em 2026-11-12

Cada mudança de código deve ter testes unitários ou de regressão pertinentes executados antes da conclusão. Registrar comando e resultado em nota curta; se não houver teste viável, explicar a limitação sem declarar validação como aprovada.

## 2026-11-19 — Cobertura funcional do app web

A matriz de retomada chegou a **41 de 45 comportamentos (91,1%)** no Playwright, no app Expo web com API simulada. Contagem por fluxo: autenticação e sessão 9/9, lista de gateways 7/7, detalhes 9/9, histórico 5/5, criação de gateway 5/9 e criação de usuário 6/6. As quatro lacunas web são descobrir e selecionar uma ponte com gateway disponível e exibir cada resultado do pareamento (online, confirmação pendente e falha).

As specs `tests/e2e/auth-routing.spec.ts`, `tests/e2e/gateway-management.spec.ts` e `tests/e2e/creation-flows.spec.ts` ganharam 12 cenários. O lote cobre autenticação e logout, busca/filtro/paginação/atualização da lista, renomear/excluir gateway, editar/salvar/aplicar Ethernet, alertas, polling de detalhe, rejeição de campo pelo servidor e permissão de administrador. A métrica é de comportamentos web. Android e gateway físico ficaram fora desta execução.

Comandos no diretório `mobile_vpn/mobile_vpn_app`:

- `env EXPO_OFFLINE=1 DEBUG=pw:webserver ./node_modules/.bin/playwright test --workers=1` — 27 aprovações e 3 falhas nas asserções de montagem inicial do login, visibilidade de senha e alternância de administrador.
- `env EXPO_OFFLINE=1 ./node_modules/.bin/playwright test --workers=1 -g 'sessão ausente apresenta|senha começa oculta|usuário pode alternar'` — 3/3 aprovados após os ajustes, em 15,2 s.
- `./node_modules/.bin/expo lint` e `./node_modules/.bin/tsc --noEmit` — ambos aprovados após os ajustes.

## 2026-11-19 — Pareamento do gateway na web

Os três cenários adicionados a `tests/e2e/creation-flows.spec.ts` completaram **45 de 45 comportamentos da matriz web**. Eles verificam seleção da ponte e do gateway, aprovação HTTPS com dados de teste, confirmação online, recibo com confirmação pendente após o prazo, retorno e falha com nova tentativa disponível. A spec exercita a interface web com serviços simulados. O pareamento de um gateway físico requer validação em dispositivo.

- `env EXPO_PUBLIC_API_URL=https://saganexus-e2e.test/api/v1 EXPO_OFFLINE=1 CI=1 ./node_modules/.bin/playwright test --workers=1 tests/e2e/creation-flows.spec.ts` — 12/12 aprovados em 39,3 s, incluindo os nove cenários anteriores da spec.
- `./node_modules/.bin/expo lint` e `./node_modules/.bin/tsc --noEmit` — ambos aprovados.

## 2026-11-19 — Campos obrigatórios e opcionais

Quatro testes novos e três ampliados em `tests/e2e/auth-routing.spec.ts`, `tests/e2e/creation-flows.spec.ts` e `tests/e2e/gateway-management.spec.ts`. O Playwright validou login apagando cada campo, cadastro de usuário com erros locais e 422 simulado, gateway com nome obrigatório e EUI/localização/IP de gerenciamento opcionais, Ethernet estática com cada campo obrigatório em branco e DHCP com fallback ligado/desligado. DNS secundário ficou em branco no envio válido.

- No app, `env EXPO_PUBLIC_API_URL=https://saganexus-e2e.test/api/v1 EXPO_OFFLINE=1 CI=1 ./node_modules/.bin/playwright test --workers=1 -g 'login exige e-mail|cadastro de usuário distingue|cadastro de gateway aceita somente|gateway exige nome|gateway é criado com campos|valida e salva IP estático|Ethernet DHCP só exige'` — 7/7 aprovados em 28,4 s.
- `./node_modules/.bin/expo lint` e `./node_modules/.bin/tsc --noEmit` — ambos aprovados.
- No backend `mobile_vpn/mobile_vpn`, `node --input-type=module` com sonda via stdin nos validadores `user.ts`, `gateway.ts` e `gateway_ethernet_config.ts` — 51 entradas. Em 47, a saída correspondeu exatamente à previsão. Três rejeições por senha de cadastro ausente ou fora do tamanho também sinalizaram a confirmação. O validador de login aceitou a string vazia. A sonda também observou que o validador Ethernet aceita prefixo decimal dentro da faixa. O app bloqueia senha vazia e prefixo decimal quando o perfil é exigido. Unicidade, autenticação da credencial e persistência em banco ficaram fora da sonda.

## 2026-11-19 — Senhas obrigatórias

O usuário confirmou que está usando o APK atualizado e conseguiu criar um gateway real. A mudança seguinte foi validada localmente: `src/app/login.tsx`, `src/app/users/new.tsx` e `app/validators/user.ts` rejeitam senha vazia ou só com espaços no login e na criação de usuário. A criação exige também a confirmação. O app verifica a presença antes da igualdade e envia o valor original da senha quando preenchida. A API mantém o tamanho de 8 a 32 caracteres no cadastro.

- Backend: `node --test scripts/tests/user_validators.test.mjs` — aprovado. Importa os validadores reais e substitui apenas a regra de unicidade no processo de teste, sem banco.
- App: `env EXPO_PUBLIC_API_URL=https://saganexus-e2e.test/api/v1 EXPO_OFFLINE=1 CI=1 ./node_modules/.bin/playwright test --workers=1 -g 'login exige e-mail|cadastro de usuário distingue|usuário exige que as senhas coincidam'` — aprovado. Cenários em `tests/e2e/auth-routing.spec.ts` e `tests/e2e/creation-flows.spec.ts`.
- `./node_modules/.bin/expo lint` no app e `./node_modules/.bin/tsc --noEmit` no app e no backend — aprovados. O ESLint do backend estava indisponível no ambiente.

## 2026-11-19 — Prefixo inteiro e uplink Ethernet

O usuário confirmou que, após criar o gateway pelo APK atualizado, mudou o cabo para o uplink Ethernet com internet. O gateway permaneceu online durante o acompanhamento e seguia online na manhã seguinte. Esse teste de campo verificou o uplink. A aplicação de uma configuração Ethernet pelo app ficou fora desse relato.

`app/validators/gateway_ethernet_config.ts` agora exige prefixo IPv4 inteiro de 1 a 32 tanto no perfil obrigatório quanto no opcional. Em DHCP sem fallback, o campo pode ser omitido. O app já aplicava a mesma regra. A alteração de prefixo fica no backend.

- No backend, `node --test scripts/tests/gateway_ethernet_config.test.mjs` e `node scripts/tests/gateway_ethernet_config.test.mjs` — aprovados. Quatro casos exercitam inteiros nos limites, faixa inválida, decimal e presença conforme o modo, usando o validador real sem banco.
- `./node_modules/.bin/tsc --noEmit` — aprovado no backend.

## 2026-11-19 — Remoção de DNS secundário e endereços IPv4

O formulário `src/app/gateways/[id].tsx` envia `secondaryDns: null` ao limpar o campo. `app/validators/gateway_ethernet_config.ts` preserva o valor nulo, mantém a omissão para clientes antigos e exige IPv4 no endereço estático e no gateway. `app/services/gateway_network_command_builder.ts` limpa o valor anterior no fallback DHCP e rejeita endereços IPv6 legados nos perfis aplicados como IPv4. O app omite IP e gateway ocultos ao desligar o fallback para permitir voltar ao DHCP em perfis legados.

- Backend: `node --test --test-reporter=tap scripts/tests/gateway_ethernet_config.test.mjs scripts/tests/gateway_network_command_builder.test.mjs` — dois arquivos aprovados, com nove casos declarados.
- App: `env EXPO_PUBLIC_API_URL=https://saganexus-e2e.test/api/v1 EXPO_OFFLINE=1 CI=1 ./node_modules/.bin/playwright test --workers=1 --reporter=dot -g 'valida e salva IP estático|limpa o DNS secundário|Ethernet DHCP só exige|desliga o fallback DHCP com endereços IPv6 legados'` — 4/4 aprovados em 37,3 s com API simulada.
- `./node_modules/.bin/expo lint` no app e `./node_modules/.bin/tsc --noEmit` nos dois projetos — aprovados.

A mudança local requer API atualizada antes do APK para que o desbloqueio e a remoção explícita tenham efeito. A aplicação no Browan físico e o deploy ficaram fora desta rodada.
