# Validação preliminar VPN — 2026-11-03

- Credenciais locais CloudConnexa validadas: endpoint OAuth respondeu HTTP 200 e retornou token, sem exibir ou persistir o segredo/token.
- Gateway 4 consultado no banco local. SSH autenticado com chave local, fingerprint cadastrada verificada e destino restrito pela allowlist /32. Comando somente leitura `true` terminou com código 0.
- Nenhuma configuração aplicada ao gateway. Isso comprova autenticação da API e acesso SSH, não conexão do túnel, rotas ou tráfego VPN.
- Próxima etapa: inspecionar estado do conector e túnel, depois verificar rotas e tráfego conforme escopo autorizado.

## Inspeção do túnel

- API listou uma rede e um conector OFFLINE; IDs retornados diferem de cc_network_id/cc_connector_id do gateway 4 no banco. Consulta direta ao ID cadastrado respondeu HTTP 400, insuficiente para afirmar remoção da rede.
- SSH com fingerprint validada: processo openvpn presente, /etc/openvpn/client.conf presente; nenhuma interface tun/tap/ovpn ou rota VPN observada. Somente rota padrão e redes locais via eth0.
- Banco marca gateway online; esse status não comprova túnel ativo. Verificação do init script retornou 127, portanto início automático não confirmado.
- Sem alterações remotas ou no banco. Próximo passo: identificar o perfil instalado e a falha de conexão com saída sanitizada; reconciliar o vínculo com a rede correta antes de provisionar/reiniciar. Tráfego VPN e reconexão ainda não testados.

## Diagnostico filtrado do perfil e log

- Perfil usa dev tun e endpoints br-gru.gw.openvpn.com; dispositivo /dev/net/tun presente; DNS retornou enderecos IPv4.
- Init real: /etc/init.d/S90openvpn; log real: /app/log/openvpn/openvpn.client.log. Nao foi usado o init estilo OpenWrt.
- Resumo sanitizado da consulta ao log (sem logs brutos ou segredos):
{"gatewayObservation":"LOG_PATHS\n/var/run/openvpn.client.pid\nINIT_METADATA\n/app/log/openvpn\n/usr/sbin/openvpn\n/usr/sbin/openvpn\n/proc/${pidnumber}/cmdline\nPROCESS_LOG_FLAGS\n--log\n/app/log/openvpn/openvpn.client.log\n--config\n/etc/openvpn/client.conf\nDNS\nServer:    10.42.0.1\nAddress 1: 10.42.0.1 lucas\n\nName:      br-gru.gw.openvpn.com\nAddress 1: (null)\nAddress 2: (null)\nAddress 3: (null)\nAddress 4: (null)\nAddress 5: (null)\nAddress 6: (null)\nAddress 7: (null)\nAddress 8: (null)\nAddress 9: 146.70.163.134\nAddress 10: 146.70.163.135\nLOG_SUMMARY\nfile=/app/log/openvpn/openvpn.client.log\nauth_failed=0 dns_error=0 tls_error=18 cert_error=0 route_error=0 refused=0 initialized=0 config_error=0 timeout=0 restart=18\n"}
- Sem alteracoes no gateway ou banco.

## Preparacao da migracao de conta

- Usuario informou expiracao do trial anterior e uso de outra conta CloudConnexa. Credenciais atuais autenticam na conta nova.
- Conta nova lista uma rede: Orange Tiger, conector connector 01, OFFLINE. Ainda nao confirmado se esse conector deve ser dedicado ao gateway 4.
- Fluxo atual obtem perfil via POST /api/v1/networks/connectors/{id}/profile. Vinculo exige atualizar vpn_resources e campos legados cc_* em conjunto; rota/IP service tambem precisa corresponder a conta nova. Nao basta alterar IDs de rede/conector isoladamente.
- Nenhum perfil gerado/instalado; banco e gateway inalterados. Proposta: dedicar conector existente ao gateway 4, preservar perfil atual no proprio equipamento com permissao restrita, configurar rota SSH correspondente e reconciliar vinculos, validar tunel; alternativa: criar rede/conector exclusivos sem reutilizar Orange Tiger.

## Origem de acesso — contexto recuperado

- Fluxo confirmado no codigo: app chama backend; backend acessa gateway por SSH. Nao pedir novamente ao usuario para escolher entre acesso do app e do backend.
- Conta nova: GET /hosts retornou lista vazia; GET /user-groups retornou grupo Default. Isso nao exclui conexao do backend via usuario VPN.
- Maquina local do backend possui tun0 com IPv4 100.96.1.66/28. Conta e identidade desse tunel ainda nao verificadas; nao presumir conta antiga nem host novo obrigatorio.
- Criacao anterior de grupo vazio falhou HTTP 400 e nao alterou .env. Causa detalhada da rejeicao ainda nao identificada. Proxima etapa: identificar cliente/identidade do tunel local e configurar grupo com origem correspondente, evitando regra geral para todos os usuarios.

## Identidade do tunel local — consulta atual

- CloudConnexa da conta nova: GET /sessions?status=ACTIVE&size=100 retornou zero sessoes; usuario existente OFFLINE, sem dispositivos registrados.
- OpenVPN 3 local, consultado como lucas: sessions-list vazio e configs-list vazio. Processos OpenVPN 3 existem; tun0 esta UP com contadores de trafego, mas isso nao identifica conta nem comprova sessao autenticada.
- Correcao da interpretacao anterior: interface tun0 presente nao basta para afirmar VPN conectada. Identidade/conta do tunel permanece indeterminada; backend nao tem sessao ativa reportada pela conta nova.
- Caminho de trabalho mantido: backend acessa gateways por SSH. Necessario conectar identidade do backend a conta nova e criar politica de acesso correspondente; nao pedir novamente a arquitetura ao usuario. Sem alteracoes de conectividade, permissoes ou .env nesta etapa.

- Backend VPN 2026-11-03: {"hostCreated":true,"hostId":"15b220fb-7fe2-41fc-9deb-961be733fcc8","connectorId":"6f1d7127-fbe0-4021-a20c-7c082e88b307"}

- Backend VPN 2026-11-03: {"profileImported":true,"exitCode":0}

- Backend VPN 2026-11-03: {"connectionCommandExit":0,"connectedMessage":true,"timedOut":false,"errorCategory":null}

- Backend VPN 2026-11-03: {"hostId":"15b220fb-7fe2-41fc-9deb-961be733fcc8","connectors":[{"id":"6f1d7127-fbe0-4021-a20c-7c082e88b307","status":"OFFLINE"}]}

- Passo 1 migracao gateway 4: {"networkCreated":true,"name":"SagaNexus Gateway 4","networkId":"5a506b21-67c0-4137-93df-ed04248b3f79","connectorId":"a51d77e9-b312-42c2-a85d-1807e3b11803","installed":false,"databaseUpdated":false}

- Passo 1 migracao gateway 4: {"verified":true,"name":"SagaNexus Gateway 4","networkId":"5a506b21-67c0-4137-93df-ed04248b3f79","connectors":[{"id":"a51d77e9-b312-42c2-a85d-1807e3b11803","name":"saganexus-gateway-4-connector","status":"OFFLINE"}],"previousNetworksPreserved":true,"nextStep":"Criar grupo com origem SagaNexus Backend e destino exclusivo desta rede; perfil e banco ainda inalterados"}

## Passo 2 — grupo bloqueado por validacao da API

- POST access-groups com origem HOST backend 15b220fb-7fe2-41fc-9deb-961be733fcc8 e destino NETWORK_SERVICE rede 5a506b21-67c0-4137-93df-ed04248b3f79 retornou 400.
- Erro detalhado: destination[0].parent, codigo 12-11-2, Network with ID ... not found. GET /networks imediatamente depois confirmou a mesma rede e conector existentes. Nao afirmar que rede foi removida.
- Grupo nao criado; .env inalterado. Rede ainda sem IP Service SSH: proxima etapa verificar requisito/modelo do destino e cadastrar o servico SSH necessario antes de repetir criacao com destino validado. Nao fazer novas tentativas identicas.

- Servico SSH rede nova: {"created":true,"networkId":"5a506b21-67c0-4137-93df-ed04248b3f79","serviceId":"31d961d4-3a6c-4e38-adc4-9fe3afc09917","route":"10.42.0.126/32","protocol":"SSH","databaseUpdated":false}

- Servico SSH rede nova: {"verified":true,"serviceId":"31d961d4-3a6c-4e38-adc4-9fe3afc09917"}

## Grupo da conta nova

- Grupo SagaNexus Gateways criado/reutilizado e existencia verificada na API; ID 6dd0dba2-6494-4933-8b7e-742021437142 configurado no .env local. Regras verificadas na API: origem exclusiva HOST SagaNexus Backend (15b220fb-7fe2-41fc-9deb-961be733fcc8); destino NETWORK_SERVICE exclusivo SagaNexus Gateway 4 (5a506b21-67c0-4137-93df-ed04248b3f79). allCovered cobre os servicos dessa rede, nao todas as redes.
- Origem de acesso definida e verificada: host SagaNexus Backend. Reinicio/reload do backend ainda nao realizado.
- Documentacao oficial de POST access-groups/{id}/destination indica envelope destination: [...]; implementacao atual envia objeto isolado. Validar/corrigir antes de provisionamento real. Nenhuma rede criada nem perfil instalado no gateway.

## Passo 2 concluido

- Apos criar e verificar o IP Service SSH, mesma rede foi aceita no grupo: POST access-groups HTTP 201. Evidencia indica dependencia do servico para esse destino; nao era remocao da rede.
- Grupo SagaNexus Gateways 6dd0dba2-6494-4933-8b7e-742021437142, origem exclusiva host SagaNexus Backend, destino rede SagaNexus Gateway 4; regras relidas e verificadas. .env local atualizado apenas no ID do grupo.
- Servico SSH 31d961d4-3a6c-4e38-adc4-9fe3afc09917, rota 10.42.0.126/32. Perfil remoto e vinculos do gateway no banco ainda antigos. Reinicio do backend pendente; formato de associacao automatica em cloud_connexa_service.ts segue pendente de validacao/correcao antes de novos cadastros.
- Proxima etapa: preservar perfil antigo, instalar perfil do conector novo a51d77e9-b312-42c2-a85d-1807e3b11803 e reconciliar vpn_resources/cc_* com rede/servico novos de forma recuperavel; testar acesso pela VPN, distinguindo de rota Ethernet local.

- Instalacao perfil gateway 4: {"error":"ENETUNREACH"}

## Passo 3 — caminho de instalacao desviado pela VPN

- Tentativa de instalacao encerrou ENETUNREACH antes do registro profileInstalled: nenhuma substituicao de perfil ou backup remoto confirmados; banco inalterado.
- API autenticou normalmente; conector do gateway segue OFFLINE. ip route get 10.42.0.126 aponta via 100.96.1.33 dev tun2 src 100.96.1.34; Ethernet enp1s0 continua UP em 10.42.0.1/24, vizinho gateway MAC 00:16:16:2b:c7:26.
- A rota /32 publicada prevalece sobre o caminho Ethernet /24. Resolver bootstrap local antes de repetir instalacao: suspender temporariamente a sessao VPN correta do backend (confirmar sessao atual, nao presumir tun1), instalar via Ethernet, reconectar em finally e testar caminho VPN; alternativa rota local temporaria exige privilegio administrativo. Nao alterar IP ou allowlist de destino.
- Script preparado em /tmp/saganexus-install-gateway-profile.cjs faz backup restrito no equipamento, verifica fingerprint, instala atomicamente e tenta rollback se tunel nao subir. Nenhum segredo persistido no vault.

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Instalacao perfil gateway 4: {"error":"Error"}

- Bootstrap Ethernet gateway 4: {"installerExitCode":1}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Instalacao perfil gateway 4: {"profileInstalled":true,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793707595619","connectorId":"a51d77e9-b312-42c2-a85d-1807e3b11803","databaseUpdated":false}

- Instalacao perfil gateway 4: {"restartExitCode":0}

- Instalacao perfil gateway 4: {"tunnelInterfaceUp":false,"observation":"initialized=0 auth_failed=0 tls_error=0"}

- Instalacao perfil gateway 4: {"rollbackAttempted":true,"rollbackExitCode":0,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793707595619"}

- Instalacao perfil gateway 4: {"error":"TUNNEL_NOT_ESTABLISHED","detail":"TUNNEL_NOT_ESTABLISHED"}

- Bootstrap Ethernet gateway 4: {"installerExitCode":1}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Diagnostico filtrado de inicializacao: {"gatewayObservation":"DNS_CURRENT\nAddress 1: 10.42.0.1 lucas\nName:      br-gru.gw.openvpn.com\nAddress 1: (null)\nAddress 2: (null)\nAddress 3: (null)\nAddress 4: (null)\nAddress 5: (null)\nAddress 6: (null)\nAddress 7: (null)\nAddress 8: (null)\nAddress 9: 45.162.230.85\nAddress 10: 45.162.230.86\nAddress 11: 45.162.230.87\nAddress 12: 45.162.230.88\nAddress 13: 146.70.163.133\nERROR_DETAILS\nPROCESS_STATE\n6049\nDNS_CONFIG\nnameserver 10.42.0.1\nnameserver 10.42.0.1 # eth0\nROUTE_TO_INTERNET\n1.1.1.1 via 10.42.0.1 dev eth0  src 10.42.0.126 \n    cache \n"}
- vpn_enable=1; OpenVPN 2.5.6 com OpenSSL 1.0.2j. Init retorna 0 incondicionalmente; ausencia de processo observada. Perfil/banco nao alterados nesta etapa.

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Instalacao perfil gateway 4: {"profileInstalled":true,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793711385205","connectorId":"a51d77e9-b312-42c2-a85d-1807e3b11803","databaseUpdated":false}

- Instalacao perfil gateway 4: {"restartExitCode":0}

- Instalacao perfil gateway 4: {"tunnelInterfaceUp":false,"observation":"initialized=0 auth_failed=0 tls_error=0"}

- Instalacao perfil gateway 4: {"newProfileFailureDiagnostics":"PROCESS\n27521\nERROR_DETAILS\nSTAGE_COUNTS\nudp=4 tcp=0 tls_initial=0 peer=0 initialized=0"}

- Instalacao perfil gateway 4: {"rollbackAttempted":true,"rollbackExitCode":0,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793711385205"}

- Instalacao perfil gateway 4: {"error":"TUNNEL_NOT_ESTABLISHED","detail":"TUNNEL_NOT_ESTABLISHED"}

- Bootstrap Ethernet gateway 4: {"installerExitCode":1}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Diagnostico filtrado de inicializacao: {"gatewayObservation":"CAPTURE_TOOL\nUDP_SOCKETS\nActive Internet connections (w/o servers)\nProto Recv-Q Send-Q Local Address           Foreign Address         State       \nudp        0      0 10.42.0.126:56035       10.42.0.1:53            ESTABLISHED \nOUTPUT_POLICY\nChain OUTPUT (policy ACCEPT 535K packets, 84M bytes)\n pkts bytes target     prot opt in     out     source               destination         \n 363K   33M ACCEPT     icmp --  *      *       0.0.0.0/0            0.0.0.0/0           \n10816  822K ACCEPT     udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp dpt:123\nINPUT_POLICY\nChain INPUT (policy DROP 41 packets, 7392 bytes)\n pkts bytes target     prot opt in     out     source               destination         \n    0     0 PingFlood  icmp --  *      *       0.0.0.0/0            0.0.0.0/0            icmptype 8\n25179 5196K PortScan   tcp  --  *      *       0.0.0.0/0            0.0.0.0/0           \n 1131 67860 TcpSynFlood  tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp flags:0x17/0x02\n 357K   32M ACCEPT     all  --  lo     *       0.0.0.0/0            0.0.0.0/0           \n 164K   62M ACCEPT     all  --  *      *       0.0.0.0/0            0.0.0.0/0            ctstate RELATED,ESTABLISHED\n    0     0 ACCEPT     icmp --  *      *       0.0.0.0/0            0.0.0.0/0           \n    0     0 ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:80\n    0     0 ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:443\n    0     0 DROP       udp  --  *      *       0.0.0.0/0            0.0.0.0/0            udp dpt:123\n    0     0 ACCEPT     tcp  --  *      *       0.0.0.0/0            0.0.0.0/0            tcp dpt:22\n   17  3161 LOG        all  --  *      *       0.0.0.0/0            0.0.0.0/0            limit: avg 1/min burst 5 LOG flags 0 level 4 prefix \"DROP PACKET: \"\nVPN_ROUTES\n45.162.230.88 via 10.42.0.1 dev eth0  src 10.42.0.126 \n    cache \nDNS_REMOTE_STAGE\n"}
- vpn_enable=1; OpenVPN 2.5.6 com OpenSSL 1.0.2j. Init retorna 0 incondicionalmente; ausencia de processo observada. Perfil/banco nao alterados nesta etapa.

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

## Requisito de funcionamento e transporte

- Usuario reforcou que o fluxo precisa funcionar integralmente; nao considerar troca de protocolo ou processo ativo como criterio de entrega.
- Backend conectado via UDP 1194 na mesma conta. Host local: encaminhamento IPv4 habilitado; Ethernet browan-lab em modo shared; rota ao servidor VPN pela Wi-Fi, nao pelo tunel.
- Gateway: OUTPUT ACCEPT; INPUT permite RELATED,ESTABLISHED; rota ao servidor via 10.42.0.1 eth0. Isso nao comprova passagem dos pacotes UDP pelo NAT do host; causa permanece aberta. tcpdump nao encontrado no gateway.
- Consulta feita com perfil antigo restaurado: socket UDP conectado ao DNS, nenhum endpoint VPN extraido no trecho consultado. Nao atribuir isso ao perfil novo.
- Nenhuma regra de firewall ou perfil alterados. Backend reconectado ao final. Faltam evidencia do transporte durante uso do perfil novo e posterior validacao ponta a ponta, vinculos banco, reinicio/reconexao e provisionamento automatico.

## Captura de trafego — bloqueio efetivamente verificado

- tcpdump executado com escalacao do sandbox ainda roda como lucas: captura em enp1s0 negada por socket Operation not permitted.
- Tentativa sudo -n timeout tcpdump recusada: a password is required. Nao solicitar senha no chat nem afirmar que aprovacao do sandbox equivale a root.
- tcpdump sem capabilities; dumpcap nao encontrado; conntrack do host nao legivel. Captura local requer comando administrativo executado pelo usuario ou permissao de sistema fornecida por administrador. Nao alterar privilegios persistentes automaticamente.
- Nenhum novo perfil instalado neste diagnostico. Preferir captura somente de cabecalhos UDP 1194 (sem -A, -X ou -w) durante teste controlado do perfil novo; encerrar ao final.

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Instalacao perfil gateway 4: {"profileInstalled":true,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793711819099","connectorId":"a51d77e9-b312-42c2-a85d-1807e3b11803","databaseUpdated":false}

- Instalacao perfil gateway 4: {"restartExitCode":0}

- Instalacao perfil gateway 4: {"tunnelInterfaceUp":true,"observation":"7: tun0    inet 100.96.1.50/28 scope global tun0\\       valid_lft forever preferred_lft forever\ninitialized=1 auth_failed=0 tls_error=0"}

- Instalacao perfil gateway 4: {"completed":true,"profileKept":true,"backupPath":"/etc/openvpn/client.conf.before-account-migration-1793711819099","nextStep":"Reconciliar vinculos no banco e testar SSH pela VPN; gateway nao reiniciado integralmente"}

- Bootstrap Ethernet gateway 4: {"installerExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Reconciliacao gateway 4: {"vpnRouteConfirmed":true,"interface":"tun1","source":"100.96.1.34"}

- Reconciliacao gateway 4: {"error":"ENETUNREACH"}

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Diagnostico filtrado de inicializacao: {"gatewayObservation":"TUNNEL\n7: tun0    inet 100.96.1.50/28 scope global tun0\\       valid_lft forever preferred_lft forever\nROUTES\ndefault via 10.42.0.1 dev eth0 \n10.42.0.0/24 dev eth0  proto kernel  scope link  src 10.42.0.126 \n100.96.1.48/28 dev tun0  proto kernel  scope link  src 100.96.1.50 \n168.168.168.0/24 dev eth0  proto kernel  scope link  src 168.168.168.253 \nRETURN_ROUTE\n100.96.1.34 via 10.42.0.1 dev eth0  src 10.42.0.126 \n    cache \nSSH_LISTENER\ntcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      \nPROCESS\n29858\nINIT_ROUTE_POLICY\n35:\tlocal opt=\"--route-nopull\"\n"}
- vpn_enable=1; OpenVPN 2.5.6 com OpenSSL 1.0.2j. Init retorna 0 incondicionalmente; ausencia de processo observada. Perfil/banco nao alterados nesta etapa.

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

## SSH VPN e reconciliacao — banco ainda inalterado

- Rota local ao gerenciamento 10.42.0.126 confirmada via tun1, source 100.96.1.34; SSH falhou ENETUNREACH. Script /tmp/saganexus-reconcile-gateway.cjs abortou antes de BEGIN/UPDATE.
- Gateway mantem tun0 100.96.1.50/28 e processo OpenVPN ativo. SSH escuta 0.0.0.0:22.
- Problema concreto observado: ip route get 100.96.1.34 no gateway retorna via 10.42.0.1 dev eth0, nao tun0. So ha rota conectada 100.96.1.48/28 na tun0. Init S90openvpn define --route-nopull por padrao.
- Consulta API ainda devolveu OFFLINE apesar de tun0/processo presentes; nao equiparar interface existente a sessao saudavel nem considerar rota de retorno como unica causa comprovada.
- Diagnostico por cabo concluiu; backend reconectado. Proxima etapa corrigir rota de retorno VPN de forma persistente e validar transporte/SSH antes de reconciliar IDs no banco. Nao remover --route-nopull indiscriminadamente: conferir rotas da conta e efeitos no gerenciamento.

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Diagnostico filtrado de inicializacao: {"gatewayObservation":"BACKUP=/etc/openvpn/client.conf.before-backend-route-1793712272\nRETURN_ROUTE\n100.96.1.34 dev tun0  src 100.96.1.50 \n    cache \nPERSISTENT_ROUTE\nroute 100.96.1.34 255.255.255.255 vpn_gateway\n"}
- vpn_enable=1; OpenVPN 2.5.6 com OpenSSL 1.0.2j. Init retorna 0 incondicionalmente; ausencia de processo observada. Perfil/banco nao alterados nesta etapa.

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

- Reconciliacao gateway 4: {"vpnRouteConfirmed":true,"interface":"tun1","source":"100.96.1.34"}

- Reconciliacao gateway 4: {"error":"ENETUNREACH"}

## Rota especifica aplicada e estado real do conector

- Backup remoto /etc/openvpn/client.conf.before-backend-route-1793712272. Adicionada diretiva route 100.96.1.34 255.255.255.255 vpn_gateway no perfil e rota runtime 100.96.1.34/32 dev tun0. ip route get confirmou tun0 source 100.96.1.50. Persistencia apos reinicio ainda nao testada.
- Backend reconectado. SSH pela VPN ainda ENETUNREACH; banco inalterado.
- API confirmou host backend ONLINE, gateway OFFLINE; ambos licensed=true. Grupo e servico SSH conferidos: origem host backend, destino rede gateway e servico 31d961d4-3a6c-4e38-adc4-9fe3afc09917, rota 10.42.0.126/32.
- Correcao de interpretacao: tun0 e Initialization Sequence Completed em trecho do log nao comprovam sessao atualmente ativa/estavel. Investigar perda da conexao, inclusive durante reconexao do backend; nao atribuir rejeicao somente ao grupo nem continuar reconciliacao do banco antes de SSH funcionar.

- Bootstrap Ethernet gateway 4: {"backendDisconnected":true}

- Bootstrap Ethernet gateway 4: {"ethernetRouteConfirmed":true}

- Diagnostico filtrado de inicializacao: {"gatewayObservation":"TIME\nTue Nov  3 13:27:21 UTC 2026\nMONITOR_SCRIPT\n#!/bin/sh\n. /lib/functions/sysinfo.sh\nUCI=\"/usr/bin/uci\"\nIF_TUN0_NAME=\"tun0\"\nOPENVPN_LOGFILE=\"/app/log/openvpn/openvpn.client.log\"\nOPENVPN_LOG_SIZE_LIMIT=100\n\n# Prepare for debug usage, currently there has no function to call DBG_PRINT_OPENVPN\nDBG_PRINT_OPENVPN()\n{\n    if [ \"$($UCI get vpn.client.vpn_dbg_disabled)\" = \"0\" ]; then\n        echo $1\n    fi\n}\n\nmonitor_openvpn_interface (){\n    if [ \"`is_booting`\" = \"1\" ]; then\n        echo \"Skip openvpn monitor this time because system still booting\"\n    else\n        # Retry one time for sometimes OpenVPN client application is restart by server\n        retry_count=0\n        while [ $retry_count -le 1 ]\n        do\n            # Check there has IP in tun0\n            TUN0_IP_ADDR=`/sbin/ifconfig $IF_TUN0_NAME | grep \"inet addr\" | sed \"s/.*inet addr://\" | sed \"s/ .*//\"`\n\n            # Check tun0 interface has IP address\n            if [[ \"$TUN0_IP_ADDR\" = \"\" ]]; then\n                # DBG_PRINT_OPENVPN \"TUN0_IP_ADDR: NULL\"\n                sleep 8\n                let retry_count=$retry_count+1\n            else\n                # When tun0 normal, no need to echo\n                # echo \"TUN0_IP_ADDR: $TUN0_IP_ADDR\"\n                break\n            fi\n        done\n\n        # Check OpenVPN client application need restart or not\n        if [ $retry_count -ge 2 ]; then\n            /etc/init.d/S90openvpn stop\n            sleep 2\n            /etc/init.d/S90openvpn start\n            sleep 1\n        fi\n    fi\n    # Check OpenVPN log file size does not > 100 KB\n    openvpn_log_sz=`ls -s ${OPENVPN_LOGFILE} | awk {'print $1'}`\n    if [ $openvpn_log_sz -gt \"$OPENVPN_LOG_SIZE_LIMIT\" ]; then\n        cp -rf ${OPENVPN_LOGFILE} ${OPENVPN_LOGFILE}.last\n        sleep 1\n        echo \"\" > ${OPENVPN_LOGFILE}\n    fi\n}\n\nmonitor_openvpn_interface\nMONITOR_CRON\n*/1 * * * * /usr/sbin/openvpn_monitor.sh\nMONITOR_INTERVAL\n1\nSESSION_EVENTS\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nSIGUSR1[soft,network-unreachable] received, process restarting\nRestart pause, 5 second(s)\nInactivity timeout (--ping-restart), restarting\nSIGUSR1[soft,ping-restart] received, process restarting\nRestart pause, 5 second(s)\nInactivity timeout (--ping-restart), restarting\nSIGUSR1[soft,ping-restart] received, process restarting\nRestart pause, 5 second(s)\nInactivity timeout (--ping-restart), restarting\nSIGUSR1[soft,ping-restart] received, process restarting\nRestart pause, 5 second(s)\n"}
- vpn_enable=1; OpenVPN 2.5.6 com OpenSSL 1.0.2j. Init retorna 0 incondicionalmente; ausencia de processo observada. Perfil/banco nao alterados nesta etapa.

- Bootstrap Ethernet gateway 4: {"diagnosticExitCode":0}

- Bootstrap Ethernet gateway 4: {"backendReconnectExitCode":0,"connectedMessage":true}

## Causa de roteamento do laboratorio identificada

- Historico CloudConnexa: gateway conectou 13:17:42Z e encerrou 13:19:35Z; backend conectou 13:17:44Z. Historico sozinho nao comprova causalidade.
- Log gateway: SIGUSR1 soft network-unreachable e ping-restart repetidos. Monitor roda a cada minuto, mas verifica apenas presenca de IP em tun0; tun persistente pode ocultar sessao desconectada.
- Evidencia de conflito: ip route get 10.42.0.126 from 45.162.230.88 iif wlp2s0 retorna via 100.96.1.33 dev tun1, nao enp1s0. Ao backend conectar, rota VPN /32 para mesmo IP Ethernet do gateway captura tambem retorno encaminhado da internet apos NAT, desviando o transporte do proprio OpenVPN do gateway.
- Design existente preve endereco de gerenciamento distinto: GATEWAY_MGMT_IP_PREFIX padrao 10.200.0, e provision_gateway.sh instala /32 no lo. Gateway 4 usa atualmente 10.42.0.126 tanto transporte Ethernet quanto destino anunciado VPN; isso precisa ser separado.
- Proxima etapa: escolher IP livre no pool de gerenciamento com verificacao de reservas, adicionar /32 persistente em lo, atualizar somente rota do servico CloudConnexa para novo gerenciamento, allowlist e vinculos do gateway de forma recuperavel; manter 10.42.0.126 exclusivamente como acesso local/bootstrap. Reavaliar rota temporaria /32 ao backend conforme perfil. Sem mudancas adicionais nesta etapa.
