# Testes

Backend na raiz: confira os scripts atuais em `package.json` antes de executar
testes. Evidências do checkout antigo não se aplicam automaticamente ao
snapshot remoto atual.

App em `mobile_vpn_app/`:

- `npm run lint`
- `npx tsc --noEmit`
- `bash -n mobile_vpn_app/dev.sh` (verifica a sintaxe do iniciador local)

No app, lint e TypeScript passaram em 2026-10-29 antes da preparação desta
branch. Não houve validação visual em dispositivo Android ou iOS.

Ver [[Backend]], [[Estado]].
