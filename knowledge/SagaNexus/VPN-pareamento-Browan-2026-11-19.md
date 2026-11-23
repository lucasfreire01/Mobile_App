# Compatibilidade de perfis VPN no cadastro Browan

Em `app/controllers/gateways_controller.ts`, o `claim` do Browan só entrega perfis OpenVPN, que o agente instalado consegue aplicar. Um formato incompatível retorna HTTP 502 (`E_VPN_PROFILE_INVALID`) antes do envio do perfil. O código de pareamento é consumido em `complete`. O download manual tem validação própria.

Em `tests/functional/gateway_enrollment.spec.ts`, a regressão simula um perfil WireGuard, verifica a rejeição sem exposição do perfil e repete o cadastro com OpenVPN usando o mesmo código.

Na raiz do backend, `npm test -- --files tests/functional/gateway_enrollment.spec.ts` terminou com código 0 usando PostgreSQL 16 temporário. A segunda revisão conferiu a validação do perfil, o consumo do código e o caminho de download manual. Nesta etapa a validação foi de software, com o adaptador simulado.
