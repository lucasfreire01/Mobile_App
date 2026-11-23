# Recuperação DHCP após troca de rede — 2026-11-12

- Gateway reconectado ao PC tinha eth0 com endereço, cliente udhcpc ativo e nenhuma rota padrão. Pedido USR1 ao PID do cliente restaurou default via 10.42.0.1; HTTPS com CA verificada ao backend /health respondeu HTTP 200.
- Criado scripts/gateway_network_recovery.sh: confirma cabo/carrier, PID numérico e processo udhcpc antes de pedir renovação DHCP. Não inicia nem configura DHCP em dispositivos sem cliente ativo.
- `python3 -m unittest scripts/tests/test_network_recovery.py -v`: três testes aprovados, cobrindo renovação com cabo, ausência de cabo e PID reutilizado por processo diferente.
- Script instalado atomicamente no gateway, sintaxe validada e cron a cada minuto sem duplicação, com backup protegido do cron anterior. Nenhum build APK.
- Fonte do script registrada; inclusão no instalador/pacote genérico continua pendente. Troca física para rede Ethernet de produção e manutenção do online ainda exigem confirmação; não inferir desse HTTP 200 no PC.
