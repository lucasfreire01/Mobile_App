# Retomada local após reinício — 2026-11-03

- Backend encontrado escutando na porta 3333.
- Expo web iniciado em `mobile_vpn_app` com `npm run web -- --port 8081 --host localhost`.
- Acesso confirmado em http://localhost:8081 com HTTP 200.
- Verificação restrita à disponibilidade HTTP; login e VPN não foram validados nesta etapa.
- Estado de runtime datado: conferir novamente após encerrar o processo ou reiniciar o computador.

- Validação após reinício do PC: Expo iniciado com npx expo start --web --port 8081; HTTP 200 em localhost:8081. Backend já ativo em 3333; GET /health retornou HTTP 200, status ok e database ok. Gateway 10.200.0.2:22 acessível pela rota tun0. Serviços openvpn3-session@CloudConnexa e saganexus-vpn consultados inativos; a origem da conexão tun0 não foi identificada.
