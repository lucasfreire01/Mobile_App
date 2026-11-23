# Ajuste do proprietário Expo — 2026-11-18

## Ponte Linux: sobreposição local da preparação e descoberta — 2026-11-18

- Alterados `mobile_vpn/mobile_vpn/scripts/gateway_lan_bridge.ts` e `mobile_vpn/mobile_vpn/scripts/tests/gateway_bridge_startup.test.mjs`.
- O startup inicia `prepareBridgeInstallation` enquanto executa o primeiro `scan()`. Consome ambos os resultados antes do primeiro `relay.tick()` e da abertura HTTP, preservando a descoberta completa e a sessão da primeira resposta.
- Erros da preparação inicial são tratados imediatamente; o fluxo mantém a descoberta disponível e as tentativas periódicas posteriores existentes. Sem mudanças em identidade dos gateways, limpeza, credenciais, autorização ou validade das sessões.
- Regressão local: `node --experimental-strip-types --test scripts/tests/gateway_bridge_startup.test.mjs`, executada em `mobile_vpn/mobile_vpn`: exit 0, 1 teste passou, 0 falhas. A barreira do teste exige sobreposição entre o probe e a ativação e mantém as verificações de prontidão e ausência de segredos na descoberta/logs.
- A regressão direcionada foi executada pelo implementador; revisão independente e avaliação de falha/retry permanecem pendentes nesta etapa.
- Não houve medição em rede real nem comprovação de redução dos cinco minutos. Nenhum instalador alterado, serviço reiniciado, APK gerado ou código publicado.

## Envio autorizado com conclusão automática após pending — 2026-11-18

- Após o cancelamento do build `d719f8a5-3c49-4bf3-8621-254059d84f62` informado pelo usuário, foi autorizado um único novo envio.
- Fonte absoluta confirmada antes do envio: `/home/lucas/Downloads/Mobile_app/mobile_vpn/mobile_vpn_app`. Owner `lucassfreires-team`, projectId `fc2abdc0-41d4-4188-8335-a6d685b4892b`, pacote `com.saganexus.mobilevpn`.
- Pré-envio confirmou na fonte atual: `onPending` opcional, notificação única de pending, continuidade das consultas ao gateway após o prazo e resolução apenas quando a API retorna `online`; a tela então define `paired`. Cancelamento e bloqueio de aprovação duplicada preservados.
- SHA256 pré-envio de `src/lib/gateway-pairing.ts`: `7bc183a41a664417132bf77bcc1fdec06657e15ccea63616c244c75b83d377dd`.
- SHA256 pré-envio de `src/app/gateways/new.tsx`: `441991fe25cb14b1bb2806a6b990dc6fdd2744c2b0b2f6eb2010d2615b6551c9`.
- SHA256 pré-envio de `tests/gateway-pairing.test.mjs`: `1fa5d434d35b3b6faf93c89fc4d86d37c6dbf60004c0f1e776508060aaa2ea22`.
- As regressões dos três arquivos de pareamento, navegação e layout, `npm run lint`, `npx --no-install tsc --noEmit` e a revisão independente já haviam sido aprovados após a última correção, conforme a validação da etapa anterior; não foram repetidos neste envio. Estes hashes identificam a leitura pré-envio, sem representar comparação com um fingerprint anterior desconhecido.
- Executado uma vez na fonte correta: `eas build --platform android --profile preview --non-interactive --no-wait`; exit 0, upload concluído em 29s e fingerprint calculado, preservando as credenciais Android existentes.
- Novo build: `92036a06-1c52-4b9c-bcb6-37e3a7bb4cf4` — https://expo.dev/accounts/lucassfreires-team/projects/mobile_vpn_app/builds/92036a06-1c52-4b9c-bcb6-37e3a7bb4cf4
- Envio confirmado; conclusão da compilação, conteúdo do APK final e validação física ainda não verificados. Nenhuma afirmação de VPN online decorre deste envio.

## Correção local posterior ao envio: online deve concluir

- Fonte: `mobile_vpn/mobile_vpn_app`. Arquivos: `src/lib/gateway-pairing.ts`, `src/app/gateways/new.tsx` e `tests/gateway-pairing.test.mjs`.
- Após recebimento e prazo esgotado, `onPending` informa a espera uma vez e mantém a mesma operação acompanhando o gateway. A API retornar `online` encerra o acompanhamento e promove a tela para `paired` / pareamento concluído.
- Não há nova aprovação ou consulta à sessão da ponte após o recebimento. Permanecem prazo por requisição, cancelamento ao desmontar e proteção contra submissão duplicada. Sem callback, preserva-se o comportamento anterior de `PairingConfirmationPending`.
- Regressões: `node --experimental-strip-types --test tests/gateway-pairing.test.mjs tests/gateway-pairing-navigation.test.mjs tests/gateway-pairing-layout.test.mjs`, exit 0; três arquivos reportados como aprovados. Incluem confirmação online tardia, pendência única, consulta sem resposta seguida de online, submissão única e aborto após pendência.
- `npm run lint` e `npx --no-install tsc --noEmit`: exit 0 na pasta interna correta. Segundo testador aprovou independentemente os trechos críticos; nenhuma validação no celular foi realizada.
- HTTP 401/429 encerra com erro; não há recuperação específica desses códigos nem repetição automática do pareamento.
- Esta alteração é somente local e foi feita DEPOIS do envio `d719f8a5-3c49-4bf3-8621-254059d84f62`; não está incluída naquele build. Nenhum novo build foi enviado nesta etapa. O usuário pediu evitar builds repetidos: consolidar os ajustes e verificá-los localmente antes de outro APK.

## Novo envio a partir da fonte correta — 2026-11-18

- Fonte e diretório de todos os comandos desta etapa: `/home/lucas/Downloads/Mobile_app/mobile_vpn/mobile_vpn_app`.
- `npm run lint`: exit 0. `npx --no-install tsc --noEmit`: exit 0.
- As regressões em `tests/gateway-pairing.test.mjs`, `tests/gateway-pairing-navigation.test.mjs` e `tests/gateway-pairing-layout.test.mjs` já passaram nessa cópia em etapa anterior; não foram repetidas. A lógica recebeu duas revisões independentes.
- Executado uma vez: `eas build --platform android --profile preview --non-interactive --no-wait`; exit 0, upload e fingerprint concluídos, usando as credenciais Android remotas existentes.
- Novo build: `d719f8a5-3c49-4bf3-8621-254059d84f62` — https://expo.dev/accounts/lucassfreires-team/projects/mobile_vpn_app/builds/d719f8a5-3c49-4bf3-8621-254059d84f62
- Envio confirmado; compilação e APK final ainda não verificados, pois foi usado `--no-wait`.
- O build anterior `9870eef7-2071-4f2f-bf76-6f483e46dfdf` usou a pasta externa incorreta `/home/lucas/Downloads/Mobile_app/mobile_vpn_app` e não comprova instalação das alterações de pareamento.
- O código interno contém `PairingConfirmationPending` para recebimento confirmado sem confirmação online no prazo; este envio não comprova que a VPN ou o gateway estejam online. Validação física no novo APK permanece pendente.

## Retificação da fonte usada no build

- O build `9870eef7-2071-4f2f-bf76-6f483e46dfdf` foi enviado de `/home/lucas/Downloads/Mobile_app/mobile_vpn_app`, a pasta externa, sem as mudanças recentes de pareamento. Sua data e seu estado `finished` não comprovam a presença dessas mudanças.
- A fonte correta para incluir essas mudanças é `/home/lucas/Downloads/Mobile_app/mobile_vpn/mobile_vpn_app`: somente essa cópia possui `src/lib/gateway-pairing.ts`, `src/lib/gateway-discovery.ts` e o tratamento `PairingConfirmationPending` na tela de novo gateway. O conteúdo de `new.tsx` também difere entre as cópias.
- O `owner` da cópia interna já está correto (`lucassfreires-team`); ambas usam o mesmo projectId e pacote Android. Não há correção de proprietário pendente na cópia interna.
- Os checks de lint e TypeScript registrados abaixo validaram somente a pasta externa. O APK com a fonte interna e sua validação local continuam pendentes. A identidade do APK instalado no celular não foi verificada fisicamente.
- Dois testadores revisaram as evidências e aprovaram esta retificação; a entrega anterior foi reprovada como versão atual contendo as mudanças de pareamento.

## Histórico anterior à identificação da fonte incorreta

- Arquivo alterado: `mobile_vpn_app/app.json`.
- `expo.owner`: `lucasfreire00` → `lucassfreires-team`, conforme o proprietário informado para o projeto existente.
- Preservados: `extra.eas.projectId` = `fc2abdc0-41d4-4188-8335-a6d685b4892b`, pacote Android `com.saganexus.mobilevpn` e slug `mobile_vpn_app`.
- Validações antes do novo envio, executadas em `mobile_vpn_app`:
  - `eas project:info`: exit 0; acesso confirmado a `@lucassfreires-team/mobile_vpn_app`, com o mesmo projectId.
  - `npm run lint`: exit 0.
  - `npx --no-install tsc --noEmit`: exit 0.
  - `eas build:list --platform android --limit 3 --non-interactive`: exit 0; os três builds mais recentes estavam `finished`. Último: `39345a9d-c30f-4d2c-8e3b-c22e0e8f4e97`.
- Novo envio: `eas build --platform android --profile preview --non-interactive --no-wait`, exit 0; uma única solicitação, com upload confirmado.
- Perfil `preview`: APK interno (`distribution: internal`, `android.buildType: apk`).
- Conferência remota pelo primeiro testador: `eas build:list --platform android --limit 3 --non-interactive`, exit 0; novo build `9870eef7-2071-4f2f-bf76-6f483e46dfdf`, Android/preview, `finished`, distinto do anterior.
- [Build da pasta externa, sem as mudanças de pareamento](https://expo.dev/accounts/lucassfreires-team/projects/mobile_vpn_app/builds/9870eef7-2071-4f2f-bf76-6f483e46dfdf).
- [APK da pasta externa, sem as mudanças de pareamento](https://expo.dev/artifacts/eas/7x94EZ5bKsy2Urero_rb6w7jxSslwNQpHK6JtYm1x6o.apk).
- Segundo testador aprovou independentemente as evidências e a atualização documental. Instalação, comportamento no Android e assinatura do APK não foram verificados no dispositivo.
