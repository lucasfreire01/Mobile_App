# Enrollment por SSH — 2026-11-09

- Acesso LAN confirmado: root@10.42.0.126 com ~/.ssh/browan_config, hostname browan. Não registrar chave ou código.
- Scripts copiados para /tmp; sintaxe validada. HTTPS /health do backend 13-59-146-35.sslip.io respondeu 200 com CA local do gateway.
- Usuário executou o instalador e inseriu o código no terminal. Depois: agente instalado, enrollment.conf removido, OpenVPN ativo, tun0 100.96.1.50/28 e IP de gestão 10.200.0.2/32 aplicado.
- O agente usa set -eu e remove enrollment.conf após POST /enrollment/complete bem-sucedido: evidência de conclusão do fluxo, sem consulta independente ao banco.
- SSH do computador para 10.200.0.2 expirou, usando tun0 via 100.96.1.33. Acesso de gestão pelo backend e status no app ainda não validados. Não declarar operação remota concluída.
- Shell do gateway não oferece `command`; localizar executáveis por caminhos explícitos ou `which`. curl, jq, openvpn, crond e BusyBox presentes.
- Continuação com cabo no PC: /etc/network/interfaces confirmou DHCP; S92mgmtip gerado pelo enrollment só aplica o IP de gestão, sem rota de retorno. Túnel observado: 100.96.1.50/28, rede 100.96.1.48/28.
- Adicionada somente em runtime a rota `100.96.0.0/11 via 100.96.1.49 dev tun0`. Após a mudança, SSH para 10.200.0.2 funcionou (hostname browan). Causa de falha de retorno confirmada. Não houve alteração persistente nem novo teste com cabo no roteador; pendente corrigir geração/persistência antes de novo reboot.
- Persistência autorizada: perfil /etc/openvpn/client.conf recebeu uma única diretiva `route 100.96.0.0 255.224.0.0 vpn_gateway`, com backup /etc/openvpn/client.conf.before-return-route-20261109 e troca atômica. VPN não reiniciada; SSH e rota ativa confirmados após a alteração. Persistência após reconexão/reboot e uplink independente ainda precisam de teste.
- Fonte local cloud_connexa_provider.ts inclui a mesma diretiva ao entregar perfis, sem duplicar a linha exata. TypeScript do backend passou. Alteração local não implantada no backend hospedado; agente instalado não foi substituído.
- Teste físico após usuário trocar cabo para rede com internet e desligar/ligar: SSH para 10.200.0.2 funcionou; uptime observado ~4 minutos. Ethernet recebeu 10.4.13.26/24, saída via 10.4.13.254; retorno VPN consultado com origem 100.96.1.50. HTTPS do gateway ao backend respondeu health_http:200. Reconexão após reboot e acesso VPN sem Ethernet ao PC comprovados. Status exibido no app e SSH originado no backend não foram consultados nesta etapa.
