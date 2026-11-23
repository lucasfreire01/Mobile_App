# Pareamento interno — canal HTTPS — 2026-11-13

- Objetivo retomado: substituir navegador externo por pareamento no app, depois eventos reais, proteção de navegação e descoberta incremental. Sem gerar APK antes de implementar e testar.
- Investigação: `new.tsx` chama Linking.openURL; ponte atual publica descoberta HTTP e encaminha TLS bruto. CGI exige HTTPS, responde HTML e não oferece resposta JSON de aceitação. Certificado próprio do firmware impede tratar fetch nativo como solução pronta.
- Direção proposta: PC e app usam backend HTTPS como intermediário. PC mostra confirmação; app autenticado autoriza somente o PC escolhido. Descoberta local não deve transportar código de enrollment nem segredo de polling. Rotas ainda devem aplicar autorização, limites de tentativas, vínculo ao gateway, persistência criptografada e transições atômicas antes de habilitar o fluxo.
- Primeira alteração: `mobile_vpn/mobile_vpn/app/services/bridge_pairing_credentials.ts`. Gera sessão de cinco minutos, confirmação independente do token secreto do PC, hashes SHA-256 e comparação constante. Nenhuma rota ou tela alterada nesta subetapa; helper ainda não integrado.
- Regressão: `mobile_vpn/mobile_vpn/scripts/tests/bridge_pairing_credentials.test.mjs`, casos de separação de segredos, troca de sessões, prazo exato, entrada inválida e hashes corrompidos.
- Executado em `mobile_vpn/mobile_vpn`: `node --test scripts/tests/bridge_pairing_credentials.test.mjs`, exit 0, runner reportou 1 arquivo aprovado. Lint/typecheck e integração HTTP ainda pendentes.
- Preservadas alterações locais existentes. Documentação consultada: Expo SDK 58 e expo-crypto v58; não foi adicionada dependência.

## Rotas do relay — implementação local, validação pendente

- Adicionados `app/services/bridge_pairing_service.ts` e `app/controllers/bridge_pairings_controller.ts`; rotas registradas em `start/routes.ts`, no backend interno `mobile_vpn/mobile_vpn`.
- Sessões criptografadas na tabela de cache existente; expiração verificada após bloqueio de linha. Cinco confirmações incorretas bloqueiam a sessão. Aprovação exige admin, código mostrado no PC, MAC anunciado e enrollment ainda válido do gateway escolhido. Token do PC separado da autenticação do usuário; confirmação de submissão remove código de cadastro, sem marcar gateway online.
- Criado `tests/functional/bridge_pairing.spec.ts`: fluxo HTTP, não-admin, bloqueio por tentativas, vínculo ao MAC/enrollment, concorrência, entrega repetível, confirmação idempotente, expiração e ocultação de status.
- `npm test -- --files tests/functional/bridge_pairing.spec.ts`: não iniciou, ENOENT no `.env` deste checkout. Nenhuma credencial copiada ou exposta.
- `npm run typecheck`: apontou inferência `void` na função que lança exceções. Corrigida anotação explícita `never`; typecheck após correção ainda pendente.
- `./node_modules/.bin/eslint app/services/bridge_pairing_credentials.ts app/services/bridge_pairing_service.ts app/controllers/bridge_pairings_controller.ts start/routes.ts tests/functional/bridge_pairing.spec.ts`: não iniciou, executável inexistente neste checkout.
- Não publicado, não integrado à ponte ou tela. Próxima etapa: recuperar configuração de testes e ferramenta de lint sem usar dados operacionais, executar validação e corrigir falhas antes de integrar.

## Recuperação de ferramentas

- Configuração e dependências estão no backend externo `mobile_vpn`: `.env`, `.env.database-admin`, `.env.database-runtime` e executável ESLint. Não foram lidos valores de credenciais nem copiados arquivos de ambiente.
- Runner interno suporta referências via `DB_APP_ENV_FILE=../.env` e `DB_ADMIN_ENV_FILE=../.env.database-admin`; usar essas referências na próxima tentativa de regressão isolada.
- `npm run typecheck` repetido após correção: exit 0.
- ESLint localizado em `../node_modules/.bin/eslint`. Verificação dos cinco arquivos relevantes reportou 68 erros: 61 corrigíveis automaticamente e sete regras restantes, incluindo acesso a membro diretamente de expressão await nos testes. Ainda não aplicado autofix.
- Próxima etapa: corrigir lint preservando mudanças anteriores de routes.ts, executar a regressão isolada com referências de configuração e registrar os resultados. Limite de oito operações alcançado nesta etapa.

## Validação das rotas concluída

- Aplicado ESLint autofix aos cinco arquivos relevantes e corrigidos sete acessos diretos a membros de expressões await nos testes, mantendo as mesmas requisições e asserções.
- Executado `DB_APP_ENV_FILE=../.env DB_ADMIN_ENV_FILE=../.env.database-admin npm test -- --files tests/functional/bridge_pairing.spec.ts`: seis testes passaram, exit 0. Runner confirmou acesso negado às tabelas operacionais, nenhuma credencial persistida e remoção do banco e papel temporários.
- Após os ajustes de estilo: `../node_modules/.bin/eslint app/services/bridge_pairing_credentials.ts app/services/bridge_pairing_service.ts app/controllers/bridge_pairings_controller.ts start/routes.ts tests/functional/bridge_pairing.spec.ts`, exit 0. Último typecheck já aprovado na etapa anterior; alterações posteriores somente de estilo.
- Sem publicação. Próxima etapa funcional: ponte deve criar sessão pelo backend HTTPS, exibir confirmação apenas no PC, anunciar somente sessionId na descoberta, receber entrega com seu token e encaminhá-la ao gateway com identidade validada. Tela ainda usa navegador externo até integração.

## Ponte integrada localmente ao relay

- Novo `scripts/bridge_pairing_relay.ts`: aceita somente backend HTTPS configurado em `SAGANEXUS_BRIDGE_API_URL`; valida sessão, mantém token fora da descoberta, publica apenas sessionId/expiração e repete recibo sem repetir entrega ao dispositivo após falha HTTP.
- `scripts/gateway_lan_bridge.ts` instancia o relay quando configurado, exibe confirmação no PC e adiciona metadados públicos à descoberta. Sem a variável, descoberta anterior permanece ativa.
- Entrega usa SSH BatchMode/StrictHostKeyChecking: ssh-keyscan só fornece candidatos que devem corresponder a chave já confiável em known_hosts. Chaves revogadas e CA são recusadas. Arquivo temporário contém somente chaves públicas. MAC é conferido dentro do canal SSH; código vai exclusivamente por stdin.
- `scripts/browan_package/enroll.cgi` responde JSON explícito quando HTTP_ACCEPT=application/json, mantendo formulário HTML existente e exigência HTTPS. Recibo indica apenas aceitação, nunca VPN online.
- `node --test scripts/tests/bridge_pairing_relay.test.mjs scripts/tests/gateway_lan_bridge.test.mjs`: 7 testes passaram (inclui CGI real com caminhos temporários e regressão de reconexão da ponte).
- `npm run typecheck`: exit 0. ESLint com autofix dos dois scripts TS e teste novo: zero mensagens, exit 0; ajustes de formatação.
- Não instalado no gateway/PC nem publicado no backend. SSH físico, execução Windows e fluxo app→backend→ponte→CGI permanecem não validados.
- Pendências: instaladores/pacotes Linux/Windows precisam incluir bridge_pairing_relay.ts e configurar backend/exibição da confirmação antes de distribuir a ponte atual. O CGI JSON atualizado também precisa acompanhar instalação. Depois integrar cliente/tela, log real, navegação e descoberta incremental.

## Tela conectada ao pareamento interno

- Novo `mobile_vpn/mobile_vpn_app/src/lib/gateway-pairing.ts`: valida HTTPS, sessão/expiração, confirmação e identidade de seleção; autoriza via apiFetch autenticado; consulta recibo da ponte e estado online real. Timeout diferencia falta de entrega de falta de confirmação VPN. Cancelamento interrompe polling.
- `gateway-discovery.ts` reconhece apenas metadados públicos válidos de sessão. Nenhum código ou token da ponte é obtido via descoberta.
- `src/app/gateways/new.tsx`: removida abertura de navegador e cópia/exibição de código de enrollment. Campo de confirmação do PC inicia pareamento dentro do app; registros exibem somente autorização, recebimento e online, com horários locais de observação. Seleção e busca ficam desabilitadas durante execução. Cleanup cancela polling ao desmontar.
- `node --test tests/gateway-pairing.test.mjs tests/gateway-pairing-layout.test.mjs`: exit 0, runner reportou 2 arquivos aprovados. Novos casos: HTTPS, vínculo da seleção, entradas inválidas, sessão expirada/forjada, falha da ponte, timeout offline, cancelamento e rejeição HTTP.
- No app: `./node_modules/.bin/tsc --noEmit` e `npm run lint -- --no-cache`, ambos exit 0.
- Ainda sem verificação visual/browser ou dispositivo físico. Cabeçalho/gestos/retorno do Android ainda não bloqueados durante operação; próxima etapa deve tratar essa navegação e acabamento visual. Descoberta continua em lotes; instaladores e execução real permanecem pendentes. Nenhum APK ou publicação iniciados.

## Correção de requisito pelo usuário

- Toda interação de pareamento deve ocorrer no app. O PC serve somente como ponte automática para o gateway: sem código exibido no PC, terminal, confirmação no PC ou configuração manual por gateway.
- A confirmação manual de 16 caracteres foi uma escolha inadequada da implementação anterior, não um requisito do usuário. Deve ser retirada do fluxo e dos testes na revisão da autenticação.
- Não substituir confirmação por aprovação irrestrita de sessionId público: uma ponte falsa poderia solicitar a entrega do enrollment. Direção a preparar: credencial individual de ponte vinculada à conta e provisionada automaticamente pelo pacote de instalação. Instalar a ponte é o único preparo esperado no PC; seu funcionamento posterior deve ser automático.
- Fluxo-alvo: app descobre ponte/gateway → usuário seleciona e toca em parear → autorização HTTPS para a ponte confiável → entrega automática ao gateway → eventos reais no app. Projeto ainda não atende esse requisito; não distribuir APK atual.
- Próxima etapa proposta antes de ampliar a implementação: registro/autenticação da ponte no backend (serviço, controller e rotas com testes), depois atualização automática dos instaladores e remoção da confirmação da tela/cliente/relay. Mudança arquitetural e múltiplos arquivos exigem escolha da etapa conforme AGENTS.md.

## Backend ajustado para ponte vinculada à conta

- Alterados somente três arquivos de produto: `bridge_pairing_service.ts`, `bridge_pairings_controller.ts` e `start/routes.ts`, além da regressão funcional.
- `POST /api/v1/gateway-bridges` exige admin autenticado e gera autorização de instalação individual válida por 15 minutos. `POST /api/v1/gateway-bridges/:id/activate` troca essa autorização uma única vez por credencial da ponte. Segredos entregues somente nas respostas HTTPS com no-store; hashes ficam em payload criptografado.
- Criação de sessão exige bridgeId e credencial de ponte ativa. Sessão herda proprietário; aprovação no app exige a mesma conta, MAC anunciado e código de enrollment válido. Não existe confirmação manual do PC na API de aprovação nem na resposta de criação de sessão.
- Credencial da ponte é renovada automaticamente por atividade. Revogação pelo proprietário bloqueia novas sessões, polling e recibos existentes. Vínculo e ativação usam bloqueio de linha; sem migração.
- `DB_APP_ENV_FILE=../.env DB_ADMIN_ENV_FILE=../.env.database-admin npm test -- --files tests/functional/bridge_pairing.spec.ts`: 10 testes passaram; banco/papel temporários removidos, tabelas operacionais inacessíveis ao executor.
- ESLint com autofix nos arquivos alterados: zero mensagens, exit 0. `npm run typecheck`: exit 0.
- Integração pendente: relay/instaladores ainda usam contrato antigo e tela/cliente ainda contêm campo de confirmação. Nada publicado ou empacotado. Próxima etapa precisa entregar credencial automaticamente no pacote personalizado, armazená-la localmente com permissões restritas e remover a interação no PC; validar também recuperação quando a resposta de ativação se perde, antes de distribuir.

## Credencial automática e recuperação de ativação

- Backend: ativação recebe credencial gerada pelo PC e persiste apenas seu hash. A autorização de instalação continua de uso único; após ativar, somente prova da mesma credencial ativa permite retomar uma resposta perdida. A resposta não contém a credencial. Controller validado para o novo contrato.
- `bridge_pairing_relay.ts`: nova `prepareBridgeInstallation` lê configuração local restrita, exige HTTPS, gera e salva a credencial atomicamente antes da primeira chamada, recupera ativação por prova de posse e remove a autorização temporária quando confirmada. Não imprime credenciais.
- Relay cria sessões autenticadas pela identidade de instalação e não pede/exibe confirmação no PC. Sem identidade válida não solicita sessão nem publica sessionId.
- Executado `node --test scripts/tests/bridge_pairing_relay.test.mjs scripts/tests/gateway_lan_bridge.test.mjs`: 10 testes passaram, incluindo recuperação de resposta perdida e persistência anterior à rede.
- Regressão isolada `DB_APP_ENV_FILE=../.env DB_ADMIN_ENV_FILE=../.env.database-admin npm test -- --files tests/functional/bridge_pairing.spec.ts`: 10 testes passaram, banco/papel temporários removidos e tabelas operacionais inacessíveis.
- ESLint dos três arquivos de produto e dois testes alterados: zero mensagens, exit 0. `npm run typecheck`: exit 0.
- Pendências: conectar prepareBridgeInstallation à inicialização real de gateway_lan_bridge.ts; instaladores/pacotes devem transportar a configuração individual e módulo TS; retirar confirmação da tela/cliente e atualizar testes. Sem publicação, APK ou validação física nesta etapa.

## Confirmação manual removida do app e startup conectado

- Três arquivos de produto alterados: `scripts/gateway_lan_bridge.ts`, `mobile_vpn_app/src/lib/gateway-pairing.ts`, `mobile_vpn_app/src/app/gateways/new.tsx`.
- Tela não solicita nem envia confirmação do PC. Usuário seleciona gateway e toca em parear; conta e ponte registrada são verificadas pelo backend. Mensagens deixaram de pedir abertura de ponte/terminal ou digitação no PC.
- Ponte lê automaticamente bridge.json junto ao script (ou caminho configurado pelo instalador), prepara credencial e cria sessão autenticada. Falha de instalação/rede preserva descoberta e aciona nova tentativa automática, sem sobrepor inicializações. Removida impressão de confirmação do PC.
- Cliente do app valida somente dados necessários à seleção/sessão e mantém cancelamento por AbortSignal.aborted, compatível com o padrão já usado no projeto. Erro 403 agora indica ponte não autorizada para a conta.
- Comando no backend: `node --test scripts/tests/gateway_bridge_startup.test.mjs scripts/tests/bridge_pairing_relay.test.mjs scripts/tests/gateway_lan_bridge.test.mjs ../mobile_vpn_app/tests/gateway-pairing.test.mjs ../mobile_vpn_app/tests/gateway-pairing-layout.test.mjs`: 20 testes passaram. Teste de startup executa o script real com configuração temporária e rede simulada, sem interação no PC ou exposição de segredos na descoberta.
- ESLint da ponte/teste de startup: zero mensagens, exit 0. No app, `npm run lint -- --no-cache` e `./node_modules/.bin/tsc --noEmit`: exit 0. Typecheck backend não repetido nesta etapa; script real exercitado pelos testes.
- Ainda faltam instaladores/pacotes personalizados contendo módulo e configuração individual, entrega desse pacote por fluxo autenticado, proteção de navegação, descoberta incremental e validação visual/física. Sem publicação ou APK; não declarar o fluxo completo pronto para uso real.

## Instaladores com configuração automática

- Três arquivos de produto: `install_gateway_bridge_linux.sh`, `install_gateway_bridge_windows.ps1`, novo `validate_bridge_installation.ts`.
- Pré-validação de pacote completo e configuração individual HTTPS/UUID/credencial. JSON e segredos nunca aparecem em erros do validador. Em atualização, preserva somente identidade já ativada (bridgeToken sem autorização temporária pendente).
- Linux: copia módulo do relay e validador, configuração 0600 e diretório 0700; prepara arquivos e backup antes de parar serviço; rollback dos arquivos/unidade e tentativa de restauração do estado do serviço se ativação falhar. ExecStart suporta caminhos com espaços. Lock evita instalações concorrentes.
- Windows: inclui módulos/configuração, restringe ACL ao usuário, prepara backup e registra tarefa automática; restaura arquivos/tarefa anterior em falha. Não há PowerShell/pwsh neste ambiente, portanto execução e rollback Windows ainda NÃO validados.
- `node --test scripts/tests/bridge_installers.test.mjs`: exit 0, runner reportou 1 arquivo aprovado. Casos definidos: validação, instalação Linux em caminho com espaços, permissões, preservação da identidade, rollback após falha e rejeição de pacote incompleto. systemctl simulado; instalação real do PC não alterada.
- ESLint do validador/teste: zero mensagens, exit 0. `npm run typecheck`: exit 0. `bash -n scripts/install_gateway_bridge_linux.sh`: exit 0.
- Ainda necessário atualizar geradores de pacotes Linux/Windows para carregar relay, validador e configuração individual com permissões restritas, e fornecer download autenticado. Nenhum pacote novo, publicação, APK ou instalação em equipamento real realizados nesta etapa.

## Geradores de pacotes personalizados

- `package_gateway_bridge_linux.sh` e `package_gateway_bridge_windows.ps1` recebem configuração individual como segundo argumento do processo de geração. Essa entrada pertence ao backend/build, não à configuração manual do PC do usuário.
- Incluem gateway_lan_bridge.ts, bridge_pairing_relay.ts, validate_bridge_installation.ts, bridge.json e instalador, além do Node já empacotado. Configuração validada antes de downloads e novamente dentro do pacote.
- Linux usa umask 077, configuração/pacote 0600 e publicação por arquivo temporário no mesmo diretório. Falhas não sobrescrevem um pacote anterior. Mantida validação SHA-256 do Node.
- Windows prepara diretórios temporários e ZIP com ACL restrita antes de mover ao destino; script ainda sem execução Windows/PowerShell disponível. Não afirmar validação de ACL/ZIP em Windows.
- `node --test scripts/tests/bridge_packages.test.mjs`: três testes passaram com downloads e Node archive simulados, verificando conteúdo extraído, permissões, configuração individual, rejeição antes de download e preservação após erro de checksum.
- ESLint do novo teste: zero mensagens, exit 0. `bash -n scripts/package_gateway_bridge_linux.sh`: exit 0. Sem mudança TypeScript de produto; typecheck não repetido.
- Não foram baixados binários reais nem gerados pacotes com credenciais de produção. Próxima etapa para cumprir "somente app": endpoint/download autenticado deve gerar e entregar o pacote individual automaticamente; usuário apenas instala a ponte, sem copiar configuração. Permanecem pendentes navegação, descoberta incremental, validação visual/física, Windows e APK.

## Endpoint privado de download Linux

- Novo `app/services/bridge_package_service.ts`, ação download no controller existente e rota autenticada/admin `POST /api/v1/gateway-bridges/package` com plataforma no JSON. Linux x64 implementado; Windows retorna indisponível (501), sem provisionar credencial.
- Serviço usa APP_URL público HTTPS configurado no servidor, nunca Host ou URL informada pelo cliente. Gera autorização individual da conta e configuração temporária 0600. Invoca gerador com argumentos de caminhos, sem tokens em URLs/argumentos; subprocesso recebe somente PATH e TMPDIR, sem credenciais do backend.
- Uma geração/transferência por processo, espaço temporário mínimo e limites de tempo. Esse limite é por processo; distribuir lease antes de múltiplos workers. Falha de geração revoga autorização e remove arquivos.
- Resposta usa stream com no-store, attachment e prazo de instalação em cabeçalho. Finalização ou interrupção limpa diretório privado; transferência incompleta pede revogação. Nenhuma URL pública persistente com token.
- `DB_APP_ENV_FILE=../.env DB_ADMIN_ENV_FILE=../.env.database-admin npm test -- --files tests/functional/bridge_packages.spec.ts`: cinco testes passaram; banco/papel temporários removidos, dados operacionais inacessíveis. Empacotador simulado nos testes HTTP; execução real com rede externa não validada.
- ESLint dos quatro arquivos alterados (três de produto + teste): zero mensagens, exit 0. `npm run typecheck`: exit 0. API de stream/onFinish verificada nos tipos instalados do Adonis e documentação de response.
- Pendências antes de distribuir: ação de download/compartilhamento no app, scripts/fontes necessários nos metafiles do build Adonis, gerar pacote real e validar instalação/transferência. Windows segue pendente. Sem publicação ou APK; etapas anteriores de navegação, descoberta incremental e revisão visual continuam abertas.
