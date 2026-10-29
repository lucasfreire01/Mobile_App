# Revisão de segurança — 29/10/2026

Escopo desta rodada: autenticação e autorização da API, encerramento de sessão do app e leitura dos controles de destino SSH. Skill aplicada: `conducting-api-security-testing`.

## Estado verificado

- Cadastro público ausente das rotas.
- Rotas de gestão exigem autenticação e administrador.
- Tokens possuem expiração de 24 horas.
- Login possui limitação de tentativas.
- Destinos SSH passam por allowlist de endereços; conexão verifica a impressão digital do host.

Os seis testes funcionais de autenticação passaram, cobrindo ausência de cadastro público, bloqueio de contas comuns, expiração, limitação de tentativas, rejeição de destinos de gerenciamento não autorizados e revogação no logout. Isso não comprova ausência de outras vulnerabilidades nem verifica a implantação em produção.

## Correção desta rodada

O logout do app apenas apagava o estado local. Agora também envia `POST /api/v1/account/logout` com o token capturado para solicitar sua revogação no servidor. A sessão local é encerrada imediatamente e permanece encerrada em caso de falha de rede. Se a API estiver inacessível, a revogação remota não é garantida; o token continua sujeito à expiração do servidor. Recarregar a página continua solicitando login, sem equivaler a uma revogação remota.

Testes adicionados verificam método, endereço e token enviados, tratamento de token já inválido e falhas do servidor/rede.

## Validação

- Backend: `npm run typecheck` passou; teste funcional `auth_security.spec.ts`: 6 passaram.
- Frontend: `npx tsc --noEmit`, `npx expo lint` e `node --experimental-strip-types --test tests/*.test.mjs` passaram (2 arquivos de teste).
- Backend: `npm run lint` falhou com 25 erros preexistentes, principalmente formatação. Não houve mudanças no código do backend nesta rodada.
- Não houve auditoria atualizada das dependências, exploração em produção nem revisão exaustiva dos workers e scripts remotos. O relatório de 28/10 deve ser lido como histórico; vários de seus achados já têm correções no código atual.

Referência: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html — encerramento de sessão também deve invalidar a sessão no servidor.
