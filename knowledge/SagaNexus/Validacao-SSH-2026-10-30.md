# Validação SSH do laboratório — 2026-10-30

- Usuário autorizou escolher o destino para o teste; endereço identificado pelo banco (gateway 4) e vizinhança da interface local: `10.42.0.126`.
- Configurado somente no `.env` local do backend: `GATEWAY_SSH_ALLOWED_CIDRS=10.42.0.126/32`. Em produção, definir destinos de gerenciamento próprios.
- Sondagem SSH real, somente leitura, aprovada com fingerprint cadastrada e comando encerrado com código 0. Nenhuma configuração enviada ao equipamento.
- Evidência: `mobile_vpn/docs/gateway-monitor-lab-ssh-verification.json`.
- Limite: sondagem direta com ssh2; não comprova o ciclo do scheduler nem atualização online/WAN no banco. Próximo passo: recarregar o ambiente do processo backend e validar uma execução do monitor.

## Ciclo real do monitor validado

Backend iniciado com `node ace serve`; scheduler executou a sondagem real. Em 2026-10-30T11:46:03Z, consulta somente leitura confirmou gateway 4 online e last_seen_at/wan_ip_observed_at atualizados às 11:45:11Z; WAN observada 10.42.0.126. `/health`: HTTP 200, aplicação e banco ok. Evidência: `mobile_vpn/docs/gateway-monitor-lab-cycle-verification.json`. Backend mantido ativo em http://127.0.0.1:3333. Validação limitada ao laboratório e a um ciclo; não comprova produção nem coordenação entre réplicas.
