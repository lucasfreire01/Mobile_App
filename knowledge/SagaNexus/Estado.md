# Estado

Atualizado em 2026-10-29. Orientação histórica: conferir evidências antes de afirmar estado atual.

- Papel PostgreSQL restrito aplicado localmente; administração separada.
- Banco de testes descartável; 85 testes aprovados na última regressão.
- Lint, TypeScript e build aprovados.
- Índice único e reserva concorrente de IP implementados e migrados localmente.
- CloudConnexa simulada nos testes; nenhum provisionamento real validado nesta etapa.
- Falha de limpeza mantém reserva; resultado remoto incerto exige reconciliação.
- Monitor SSH em lotes, até 5 sondagens simultâneas por processo; timeout de 15s
  por sondagem e orçamento de despacho de 100s por ciclo. Retomada por cursor.
- Validação local: scheduler e health ok; 1 gateway continuou offline porque
  `GATEWAY_SSH_ALLOWED_CIDRS` bloqueou o destino antes de SSH. TCP respondeu,
  mas autenticação SSH real ainda não foi validada; ver
  `mobile_vpn/docs/gateway-monitor-lab-validation.md`.
- App: busca por nome/IP existente; formulários de criação de gateway e usuário
  adicionados. Rotas exigem sessão; as operações administrativas exigem admin.

Evidências: `mobile_vpn/docs/gateway-ip-reservations-verification.json`, `mobile_vpn/docs/backend-regression-result.json`.
Monitoramento: `mobile_vpn/docs/gateway-monitor-verification.json`.

Pendências: advisories de dependências; validação nativa Android/iOS adiada
e produção separada. Coordenação entre réplicas validada localmente abaixo.

Ver [[Backend]], [[Testes]], [[Decisoes]].

## Avanço em 2026-10-30

Ver [[Validacao-SSH-2026-10-30]]: SSH real validado no gateway 4, com fingerprint conferida e permissão local /32. Ciclo completo do monitor validado após iniciar o backend com a configuração local: gateway online, last_seen_at e WAN atualizados; API e banco saudáveis. Evidência: `mobile_vpn/docs/gateway-monitor-lab-cycle-verification.json`.

## App web validado em 2026-10-30

Login, listagem e detalhe do gateway 4 validados com backend real; status online, dados de rede e botão Atualizar confirmados. Layout conferido em desktop e 390px, sem exceções JS observadas. Evidência: `mobile_vpn/docs/gateway-app-web-verification.json`; ver [[App]]. Android/iOS nativos continuam pendentes; transição online/offline validada abaixo.

## Transição validada em 2026-10-30

Ver [[Validacao-Transicao-2026-10-30]]: ONLINE → OFFLINE → ONLINE confirmado no banco, API e app web com falha SSH controlada no backend. Configuração original restaurada, serviços saudáveis. Testes nativos pendentes por ausência de ferramentas Android nesta máquina.

## Preparação Android em 2026-10-30

Ver [[Preparacao-Android-2026-10-30]]: cache npm limpo, ADB temporário funcional e bundle JavaScript Android gerado com HTTP 200. Nenhum celular conectado; execução nativa pendente. Emulador ausente, /dev/kvm indisponível e espaço ainda limitado.

## Paginação concluída em 2026-10-30

Ver [[Paginacao-2026-10-30]]: API e app paginados, busca/status no servidor e contadores globais. 89 testes, lint/TypeScript dos dois projetos e build backend aprovados. Interface validada com 23 gateways isolados e depois com o gateway real do laboratório. Android/iOS físicos adiados pelo usuário por falta de cabo.

## Dependências revisadas em 2026-10-30

Ver [[Dependencias-2026-10-30]]: qs corrigido e patches compatíveis do Expo/RN aplicados. 89 testes e checks aprovados, fluxo web e bundle Android confirmados. Remediação parcial: backend 2 baixos; app 5 baixos e 3 altos (Zod), aguardando solução upstream compatível.

## Monitor coordenado em 2026-10-30

Ver [[Monitor-Replicas-2026-10-30]]: concessão e cursor PostgreSQL compartilhados, proteção contra resultados atrasados e recuperação após vencimento. 96 testes e checks aprovados; migração/grants aplicados e duas APIs reais validadas no laboratório. API temporária encerrada, principal saudável. Produção ainda requer implantação coordenada.

## Backend preparado para provedores VPN em 2026-10-30

Ver [[Provedores-VPN-2026-10-30]]: adaptadores substituíveis, CloudConnexa padrão, vínculos persistentes e IDs genéricos. Migração local e compatibilidade validadas; 105 testes/checks e app web aprovados. Sem provisionamento externo real nesta etapa. Próximo: escolher e integrar um segundo serviço real.
