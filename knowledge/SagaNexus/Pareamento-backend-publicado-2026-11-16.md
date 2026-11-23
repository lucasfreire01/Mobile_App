# Pareamento interno: backend publicado (2026-11-16)

- Rotas do bridge foram separadas em `mobile_vpn/mobile_vpn/start/routes/bridge_pairings.ts`; `start/routes.ts` apenas carrega esse módulo. Controller, serviços e scripts permanecem nas camadas próprias.
- Release isolado publicado em `/opt/saganexus/releases/bridge-pairing-20261116-01`, baseado no release anterior `security-validated-20261110`; rota e arquivos do bridge adicionados sem substituir as demais mudanças locais.
- Validações locais: `npx tsc --noEmit`, `npx eslint start/routes.ts start/routes/bridge_pairings.ts`, `node ace build` e quatro arquivos de teste direcionados do bridge passaram. Teste funcional Adonis não executado: o ambiente local não tem as variáveis de runtime necessárias.
- Validação em produção: Adonis listou as nove rotas do bridge; `/health` respondeu 200, provisionamento sem autenticação respondeu 401 e criação de sessão inválida respondeu 422. API e worker ficaram ativos.
- Limite: o app ainda não chama os endpoints `gateway-bridges` para registrar/baixar o pacote; a ponte deste PC está em modo de descoberta e sem `bridge.json`. Portanto, a API está publicada, mas este PC ainda precisa ser registrado e instalado para o pareamento aparecer no app.
