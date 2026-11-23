# EC2: rota legada conflitando com servidor local

Gateway com internet via PC confirmada (rota default 10.43.0.1, ping externo respondeu). Timeout online nao provou falha no compartilhamento Wi-Fi.

EC2 tinha cliente CloudConnexa e servidor local OpenVPN simultaneos. Perfil /etc/openvpn/client/saganexus-cloud.conf continha rota explicita 10.200.0.2/32 via vpn_gateway, desviando o destino para tun0 (100.96.1.33) apesar de 10.200.0.0/24 pertencer a tun-saganexus.

Removida somente a linha explicita e a rota runtime correspondente, com backup root do perfil em saganexus-cloud.conf.before-ec2-route-fix-20261117. Verificado ip route get: 10.200.0.2 dev tun-saganexus src 10.200.0.1. API, worker e ambos servicos VPN ativos. Sem reinicio ou APK.

Usuario confirmou ter excluido o cadastro apos tentativa; banco estava sem gateways. Pareamento completo e estado online ainda precisam ser verificados numa nova criacao. Reversao da rota disponivel pelo backup do perfil e ip route add 10.200.0.2/32 via 100.96.1.33 dev tun0, se necessaria.
