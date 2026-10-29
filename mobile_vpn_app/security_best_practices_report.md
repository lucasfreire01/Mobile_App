# Revisão de segurança — SagaNexus Mobile VPN

Data: 2026-10-28  
Escopo: frontend Expo/React Native e backend AdonisJS em `mobile_vpn/`, incluindo rotas, autenticação, autorização, operações SSH e dependências. Revisão estática e `npm audit`; não foram feitas requisições exploratórias contra ambiente de produção nem alterações no backend.

## Achados

### S-01 — Cadastro público entrega acesso administrativo global

- **Severidade: Crítica**, se a API estiver acessível fora de uma rede controlada.
- **Localização:** [routes.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/start/routes.ts:14), [new_account_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/new_account_controller.ts:6), [gateways_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/gateways_controller.ts:26).
- **Evidência:** `POST /api/v1/auth/signup` não tem middleware de autenticação. O controlador cria o usuário e emite um token imediatamente. As rotas de gateways exigem somente `auth`; não há verificação de papel, permissão ou propriedade do gateway.
- **Impacto:** qualquer pessoa que alcance a API pode criar uma conta e, com o token recebido, listar, criar, alterar e excluir gateways, baixar perfis VPN e solicitar mudanças de rede nos dispositivos. O banco e os endpoints tratam os gateways como recursos globais compartilhados.
- **Correção recomendada:** desabilitar o cadastro público ou exigir convite/aprovação administrativa. Adicionar papéis explícitos e autorização por recurso antes de permitir operações de gestão. Não basta ocultar o cadastro na interface: o endpoint já é acessível diretamente.
- **Ponto a confirmar:** se o cadastro aberto for requisito, ele ainda concede privilégios de operador e precisa de controles de aprovação e escopo.

### S-02 — Endereço informado pelo usuário vira destino SSH do servidor

- **Severidade: Alta.**
- **Localização:** [gateway.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/validators/gateway.ts:3), [gateway_service.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/services/gateway_service.ts:42), [gateway_ssh_service.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/services/gateway_ssh_service.ts:79), [gateway_ethernets_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/gateway_ethernets_controller.ts:63).
- **Evidência:** `managementIpAddress` aceita qualquer endereço IP. A checagem do serviço verifica somente se o endereço já está cadastrado. O backend usa esse valor como `host` SSH e autentica com a chave privada configurada no servidor. A impressão digital pode ser enviada na criação ou alterada pelo endpoint de rotação.
- **Impacto:** um usuário com conta pode fazer o backend tentar SSH contra endereços escolhidos por ele, inclusive destinos internos alcançáveis pelo servidor, permitindo sondagem de serviços SSH e uso da identidade SSH do backend contra esses destinos. O cadastro público de S-01 torna o pré-requisito de conta trivial quando a API está exposta.
- **Correção recomendada:** limitar destinos a faixas de gerenciamento explicitamente aprovadas, validar o endereço tanto na criação quanto em atualizações e impedir destinos públicos/internos fora da política. Tratar a primeira impressão digital e rotações como operações administrativas aprovadas fora do controle do próprio usuário que cadastra o gateway.
- **Nota:** a verificação da chave do host reduz ataques de intermediário, mas não restringe o endereço de destino.

### S-03 — Tokens de acesso sem expiração configurada

- **Severidade: Média.**
- **Localização:** [user.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/models/user.ts:9), [access_tokens_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/access_tokens_controller.ts:7).
- **Evidência:** o provedor é criado sem `expiresIn`, e o login chama `User.accessTokens.create(user)` também sem opções. No Adonis instalado, `expires_at` fica nulo quando não há expiração configurada.
- **Impacto:** um token copiado ou extraído permanece utilizável até ser revogado manualmente; não há limite temporal para reduzir a janela de abuso.
- **Correção recomendada:** definir validade curta para tokens, revogar tokens em eventos de senha/conta e oferecer revogação administrativa de todas as sessões. A validade precisa ser aplicada no servidor, independentemente do logout do frontend.

### S-04 — Ambiente de desenvolvimento é exposto à rede e aceita qualquer origem CORS

- **Severidade: Média, restrita a desenvolvimento.**
- **Localização:** [dev.sh](/home/lucas/Downloads/Mobile_app/mobile_vpn_app/dev.sh:77), [cors.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/config/cors.ts:21).
- **Evidência:** o launcher define `HOST=0.0.0.0`, e o CORS permite qualquer origem quando `NODE_ENV` é desenvolvimento, com `credentials: true`.
- **Impacto:** ao executar o launcher numa rede compartilhada, a API e o servidor de desenvolvimento ficam acessíveis pelas interfaces de rede da máquina; páginas de outras origens podem ler respostas CORS do backend. Com S-01, isso também facilita o uso do cadastro aberto pelo navegador de outra pessoa.
- **Correção recomendada:** manter a exposição LAN somente quando necessária para o celular, restringir origens a endereços locais conhecidos e usar firewall/rede confiável. Nunca iniciar esse launcher em uma máquina ou rede pública.
- **Limite:** o arquivo de CORS restringe produção a nenhuma origem por padrão. Não verifiquei cabeçalhos do proxy/host usado para publicar a versão web.

### S-05 — Login e cadastro sem limitação de tentativas

- **Severidade: Média.**
- **Localização:** [routes.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/start/routes.ts:14), [access_tokens_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/access_tokens_controller.ts:7), [new_account_controller.ts](/home/lucas/Downloads/Mobile_app/mobile_vpn/app/controllers/new_account_controller.ts:6).
- **Evidência:** as rotas públicas de `login` e `signup` não aplicam middleware de rate limit; não encontrei limiter configurado no backend.
- **Impacto:** tentativas de senha em massa contra contas existentes e criação automatizada de contas podem consumir recursos e ampliar abuso. A exposição do signup também amplifica S-01.
- **Correção recomendada:** impor limites no servidor por IP e identificador de conta, atrasos progressivos para falhas de login e controles de abuso para cadastro. Limites devem funcionar atrás do proxy com configuração segura de IP confiável.

### S-06 — Dependências com avisos de segurança conhecidos

- **Backend:** `npm audit` encontrou 3 avisos: 2 baixos e 1 moderado. `qs@6.16.0` é afetado por uma falha de disponibilidade ao serializar certos objetos com `arrayFormat: 'comma'`; a versão corrigida indicada é `6.16.1` ([advisory](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw)). `deepmerge@4.3.1`, transitivo de `@adonisjs/lucid@22.4.2`, tem aviso de prototype poisoning de baixa severidade e o advisory ainda não lista versão corrigida ([advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)).
- **Frontend:** `npm audit` encontrou 8 avisos: 3 altos e 5 baixos. O principal é `zod@3.25.76`, trazido pelo Expo CLI; a faixa abaixo de `4.6.6` pode consumir memória excessiva validando arrays grandes ([advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). `deepmerge@4.3.1` também aparece via Expo Config.
- **Alcance confirmado:** o caminho afetado de `qs` exige `qs.stringify` com formato de array `comma`; não encontrei chamada a esse caminho no código da API. O Zod afetado está no Expo CLI/dev tooling, não foi localizado no bundle web exportado; a explorabilidade remota pelo Metro não foi demonstrada. Portanto, os avisos do audit são reais na árvore instalada, mas não afirmo que todos sejam exploráveis por uma requisição ao app publicado.
- **Correção recomendada:** atualizar dependências no mesmo SDK Expo compatível e revalidar com `npx expo install --check`, auditoria e testes. Não usar o `npm audit fix --force` sugerido automaticamente: ele propõe downgrade incompatível do Expo SDK para 51.0.39. Avaliar `qs`/`deepmerge` com a árvore de dependências antes de aplicar overrides.

## Itens verificados sem vulnerabilidade confirmada

- Não encontrei sinks de HTML/JavaScript como `dangerouslySetInnerHTML`, `innerHTML`, `eval` ou `document.write` nas telas do app.
- Os comandos SSH de configuração usam valores IP validados e têm quoting de shell no construtor. A conexão confere a impressão digital do host; o achado S-02 é a falta de restrição do destino, não uma falha de quoting ou de pinning.
- A configuração do Adonis desabilita CSP. Como a distribuição web é estática e o servidor/CDN de produção não está neste repositório, não é possível afirmar que a resposta publicada esteja sem CSP; conferir os headers no host final.

## Verificações executadas e limites

- `npm audit --json` em `mobile_vpn/`: 3 achados; exit code 1 por vulnerabilidades.
- `npm audit --json` em `mobile_vpn_app/`: 8 achados; exit code 1 por vulnerabilidades.
- Revisão estática de autenticação, rotas, controladores, SSH, configuração CORS, busca de sinks no frontend e busca por rate limiting.
- Não executei exploração, teste de penetração, scanner dinâmico, nem consultei `.env`/credenciais. O código do backend e as configurações de produção do proxy, firewall e CDN precisam de validação no ambiente implantado.
