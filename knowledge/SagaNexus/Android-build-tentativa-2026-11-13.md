# Android preview — tentativa de build — 2026-11-13

- Usuário pediu iniciar nova versão do app; isso autoriza a build do estado atual, mesmo com integrações restantes do pareamento ainda pendentes. Não autoriza publicar backend automaticamente.
- App: `mobile_vpn/mobile_vpn_app`, perfil EAS preview/internal/APK, projeto fc2abdc0-41d4-4188-8335-a6d685b4892b. API configurada no perfil: https://13-59-146-35.sslip.io/api/v1.
- Conta Expo confirmada. Criado `.easignore` a partir do `.gitignore`, adicionando exclusão de `.env` e `.env.*`. Nenhuma alteração de código funcional ou nova execução de testes nesta tentativa; lint/typecheck do app já aprovados na etapa anterior.
- Comando: `EAS_NO_VCS=1 eas build --platform android --profile preview --non-interactive --no-wait`, executado fora do sandbox com autorização.
- Falhou no upload do projeto e dos metadados, com erro de rede ao acessar https://api.expo.dev/graphql. Exit 1. Nenhum ID ou link de build retornado; não afirmar compilação iniciada.
- Próximo passo: nova tentativa de envio EAS, após autorização para nova etapa conforme limite de oito operações. Não fazer polling rotineiro após obter ID/link.

## Nova tentativa bem-sucedida

- Usuário autorizou repetir. Mesmo comando concluiu com exit 0; upload de 22,6 MB e fingerprint confirmados.
- Build Android preview/APK criada: e05155d4-79a8-47b4-99b8-355e79f373f8.
- Link: https://expo.dev/accounts/lucasfreire00/projects/mobile_vpn_app/builds/e05155d4-79a8-47b4-99b8-355e79f373f8
- Não aguardada compilação e nenhum APK concluído confirmado. Entregar link ao usuário; não realizar polling rotineiro.
- Build contém estado local atual. Pareamento real continua dependendo da publicação do backend e instalação/distribuição da ponte atualizada; pendências funcionais anteriores não foram concluídas pelo ato de iniciar build.
