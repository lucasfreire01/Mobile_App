# Dependências — 2026-10-30

- Revisão e correções compatíveis realizadas; remediação ainda parcial.
- Backend: qs 6.16.0 → 6.17.1; alerta moderado removido. Restam 2 alertas baixos ligados ao deepmerge 4.3.1, sem release corrigida publicada na consulta.
- App: patches do SDK 58 recomendados pelo Expo aplicados (Expo 58.0.21, constants 58.0.14, linking 58.0.15, router 58.0.28, RN 0.88.1). Restam 5 baixos e 3 altos; os altos derivam do único advisory de Zod.
- CLI Expo 58.1.17 exige Zod ^3.25.76; correção está na major 4.6.6 e não há patch compatível 3.x. Sem overrides de major ou downgrade para Expo 51. deepmerge/Zod localizados em tooling/configuração; exploração remota do produto não estabelecida.
- 89 testes isolados, lint/TypeScript dos dois projetos, build backend e compatibilidade Expo aprovados. Fluxo web real e bundle Android repetidos após patches; execução nativa continua adiada pelo usuário.
- Relatório: `mobile_vpn/docs/dependency-review-2026-10-30.md`; evidência consolidada: `mobile_vpn/docs/dependency-review-verification.json`.
- Próxima decisão: acompanhar correções upstream ou planejar migração compatível dos consumidores. Não declarar auditoria zerada nem produção pronta.
