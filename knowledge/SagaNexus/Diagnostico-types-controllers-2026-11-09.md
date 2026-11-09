# Controllers e rotas: tipos do AdonisJS

- `mobile_vpn/mobile_vpn/` passou em `../node_modules/.bin/tsc --noEmit --pretty false` em 2026-11-09.
- `mobile_vpn/` mantém dois controllers e `start/routes.ts` idênticos aos da pasta interna, mas package.json, tsconfig.json, adonisrc.ts e config/auth.ts aparecem excluídos no Git.
- A cópia `mobile_vpn/mobile_vpn/mobile_vpn/` contém conflitos de merge; seu TypeScript falhou com TS1185.
- Não restaurar ou mover arquivos em massa sem definir a pasta canônica e preservar as alterações locais. Nenhum arquivo de produto foi alterado neste diagnóstico.

- Correção: configuração TypeScript externa aponta aliases e declarações para o backend interno; package.json externo define ESM; model externo usa alias para GatewayEthernetConfig. Verificação final tsc: passou sem erros.
