# Recuperação VPN gateway 4 — 2026-11-05

- Gateway local confirmado em 10.42.0.126; acesso SSH com host conhecido.
- Perfil instalado apontava para servidor legado 13.59.146.35 (saganexus-server), enquanto o conector SagaNexus Gateway 4 estava OFFLINE.
- Perfil correto obtido do conector existente CloudConnexa (br-gru.gw.openvpn.com), instalado sem exposição de segredos; backup preservado no gateway em /etc/openvpn/client.conf.before-recovery-20261105.
- Reiniciado /etc/init.d/S90openvpn.
- Verificação: CloudConnexa OFFLINE; teste SSH 10.200.0.2:22 código 101.
- Serviço VPN do computador pertence ao usuário: systemctl --user, sem sudo.

- Continuação: OpenVPN confirmou conexão. Restaurados IP 10.200.0.2/32 em lo via /etc/openvpn/saganexus-up.sh e rota 100.96.0.0/11 via vpn_gateway no perfil; backup adicional before-management-route-20261105. Verificação: conector OFFLINE; SSH gestão código 101.

- Verificação final após reconexão: SSH TCP 10.200.0.2:22 acessível (código 0); rota de retorno 100.96.1.34 via 100.96.1.49 dev tun0; Initialization Sequence Completed às 09:57:03 no log do gateway (fuso local). CloudConnexa: ONLINE. A checagem anterior ocorreu durante a reconexão, antes da instalação da rota.

- Proteção local de provision_gateway.sh: perfil instalado via arquivo temporário + rename; backup de perfil/helper/cron/UCI com lock no dispositivo; falhas de restart propagadas; validação SSH do IP de gestão com host conhecido; reversão dos arquivos em falha, preservando recuperação se rollback falhar. Testes simulados persistidos em scripts/tests/test_provision_recovery.py. Não executado contra gateway nem validado reboot. Origem da gravação do perfil legado em 04/11 ainda não identificada.

- Teste real de reboot autorizado: uptime reiniciado, LAN 10.42.0.126 voltou e perfil CloudConnexa persistiu. Verificação após boot: SSH VPN código 101; CloudConnexa OFFLINE. Metadados: 85.27; 100.96.1.34 via 10.42.0.1 dev eth0  src 10.42.0.126 ;     cache ; 2026-11-05 10:11:13 VERIFY EKU OK; 2026-11-05 10:11:13 VERIFY OK: depth=0, CN=br-gru-dc1-b1.cloud.openvpn.net.

- Recuperação automática após reboot confirmada, sem intervenção adicional: SSH 10.200.0.2:22 acessível, rota correta, CloudConnexa ONLINE. OpenVPN iniciou 10:10:32 e concluiu 10:11:15 (43s desde início do processo, não desde início do boot). Demora explicada por 8 tentativas AF_INET6 com Network unreachable e pausas de 5s, seguidas por uma tentativa IPv4 bem-sucedida. Próxima correção possível: selecionar transporte IPv4 explicitamente neste gateway sem conectividade IPv6; ainda não aplicada.

- IPv4 explícito aplicado ao gateway: remote udp -> udp4 e tcp -> tcp4; backup client.conf.before-ipv4-20261105. Reiniciado somente OpenVPN. Conexão 10:58:38–10:58:39 (1s), zero tentativas IPv6 e zero Network unreachable; SSH 10.200.0.2:22 acessível e CloudConnexa ONLINE. Não houve novo reboot após esta mudança. Provisionamento suporta BROWAN_VPN_IPV4_ONLY=1 (opt-in); testes de conversão/idempotência e recuperação passaram.

- Provisionamento agora seleciona família de transporte com BROWAN_VPN_IP_FAMILY=auto|4|6|dual (auto padrão). Detecta rotas default fora de tun/tap/lo; ignora linkdown/blackhole; somente IPv4 -> 4, somente IPv6 -> 6, ambas ou nenhuma -> dual. Falha de consulta interrompe antes de modificar perfil. Mantida compatibilidade BROWAN_VPN_IPV4_ONLY=1; opção nova explícita tem prioridade. Testes simulados de seleção, conversão/idempotência e recuperação passaram. Consulta somente leitura no gateway atual detectou 4. Sem alteração/restart do gateway. Rotas não comprovam internet; validação SSH/reversão permanecem obrigatórias. Sem teste em hardware com uplink IPv6-only.

- APK offline: confirmado backend EC2 13.59.146.35 ainda roteava 10.200.0.2 via tun-saganexus e teste TCP falhava. Criado conector exclusivo saganexus-backend-ec2-connector no host existente SagaNexus Backend; perfil instalado restrito em /etc/openvpn/client/saganexus-cloud.conf; serviço openvpn-client@saganexus-cloud habilitado/ativo; route-nopull e rota específica 10.200.0.2/32 via vpn_gateway. EC2 -> gateway TCP22 agora acessível, rota via tun0 e IP de origem 100.96.1.38. VPN legada preservada. Verificação do banco: Gateway database status:.

- Confirmada diferença de IDs entre ambientes: gateway local 4 corresponde ao IP 10.200.0.2, mas na EC2 o registro é id=1, nome gateway-teste, mesmo IP. Após corrigir VPN da EC2, status no banco hospedado confirmado online. Consulta anterior id=4 não retornou registro por diferença de ambientes. Metadados de atualização/heartbeat: 1|online|2026-11-04 13:44:47.751+00; gateway_network_operations_worker|9.
