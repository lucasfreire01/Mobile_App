# Descoberta progressiva — 2026-11-16

- `mobile_vpn/mobile_vpn_app/src/lib/gateway-discovery.ts`: fila de até 24 consultas; callback entrega cada PC validado imediatamente. Fallback direto preservado.
- `src/app/gateways/new.tsx`: exibe PCs durante a busca, preserva a escolha feita durante a varredura e prioriza PCs conhecidos da mesma sub-rede enquanto a tela estiver montada.
- Regressão: `tests/gateway-discovery.test.mjs`, com respostas controladas, concorrência limitada, resultado antes de consultas pendentes, deduplicação e fallback direto.
- Validações pendentes de execução nesta etapa; resultados serão acrescentados após cada comando. Android e rede física ainda não validados.

- `node --test tests/gateway-discovery.test.mjs tests/gateway-pairing.test.mjs tests/gateway-pairing-layout.test.mjs`: PASSOU (código 0).
- `npm run lint`: PASSOU (código 0).
- `./node_modules/.bin/tsc --noEmit`: PASSOU (código 0).
