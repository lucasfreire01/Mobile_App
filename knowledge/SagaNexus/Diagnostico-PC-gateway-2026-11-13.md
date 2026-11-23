# PC e gateway — 2026-11-13

- NetworkManager registrou conflito no endereço 10.42.0.1. Perfil `Conexão cabeada 1` alterado e salvo com compartilhamento em 10.43.0.1/24.
- Validação: `nmcli connection up` concluiu; `ip -4 -brief addr show enp1s0` confirmou o endereço. Retorno do gateway no app ainda não confirmado; sem concessão DHCP observada.
- Vizinho IPv6 respondeu por SSH, mas sua chave não corresponde à identidade conhecida do gateway nem às outras entradas de known_hosts. Confiança SSH preservada; identidade pendente.
- Limpeza autorizada de caches npm, uv e Chrome; dotslash parcialmente removido devido a permissões. `df -h --output=avail,pcent /`: 648 MB disponíveis, percentual ainda 100%. Projetos, documentos, credenciais e volumes Docker preservados.
- Journal do PC em 12/11: perdas de enlace às 14:08:26 e 14:08:58; desligamento do PC às 14:12:35. Eventos não comprovam desligamento do gateway.

## Após reconectar o cabo

- DHCP confirmou o Browan em 10.43.0.126. SSH com `StrictHostKeyChecking=yes` e `HostKeyAlias=10.42.0.126` validou a chave conhecida; hostname `browan`.
- Rota padrão via 10.43.0.1. Teste `ping -c 1 -W 3 1.1.1.1` executado no gateway retornou zero: internet restabelecida.
- Interface tun0 com rede 100.96.1.48/28 e endereço 100.96.1.50. SSH do PC para esse endereço retornou `Connection refused`: acesso de gestão pela VPN e status no app ainda não confirmados.
- O vizinho IPv6 anteriormente observado tinha outro MAC e não foi autenticado como o Browan.
