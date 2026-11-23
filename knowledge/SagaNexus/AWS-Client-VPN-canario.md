# Canário AWS Client VPN com Browan

O objetivo do canário é provar que o backend identifica a sessão de um Browan e abre SSH pela VPN, inclusive após reinicialização. Neste ambiente, OpenVPN e OpenVPN3 estão disponíveis. A AWS CLI está ausente do `PATH`, não há perfil AWS local e nenhum teste real foi executado.

## Cenário de laboratório

Usar um endpoint AWS Client VPN isolado, com autenticação mútua e um certificado com CN exclusivo para o Browan canário. Confirmar e registrar que o Browan e o backend de teste estão conectados como clientes ao mesmo endpoint. O canário cobre a comunicação entre clientes. O acesso iniciado por um backend conectado apenas à VPC exige uma validação separada. Conferir a rota e a regra de autorização para o CIDR dos clientes e os controles de rede que limitam a comunicação entre os clientes autorizados. Manter uma cópia recuperável do perfil e da configuração anteriores e um acesso de recuperação ao canário antes de iniciar. [Comunicação entre clientes](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/how-it-works.html) · [Autenticação mútua](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/mutual.html)

O CN identifica o certificado do gateway. O IP atribuído é da sessão e pode mudar a cada conexão. Hoje, o [serviço de provisionamento](../../mobile_vpn/mobile_vpn/app/services/gateway_provisioning_service.ts) pressupõe que o IP de gerenciamento esteja disponível antes da criação dos recursos. O [serviço de SSH](../../mobile_vpn/mobile_vpn/app/services/gateway_ssh_service.ts) usa o IP persistido. A integração precisa resolver o endereço da sessão a partir da identidade persistida antes de tentar SSH.

## Verificação

1. Consultar as sessões no endpoint de laboratório pela AWS CLI, com um perfil autorizado a executar `DescribeClientVpnConnections`. O resultado da API inclui conexões terminadas. Filtrar pelo CN exato e por `Status.Code` igual a `active`. [Referência da AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/ec2/describe-client-vpn-connections.html)

   ```bash
   timeout 30s aws ec2 describe-client-vpn-connections \
     --profile PERFIL_AWS_LAB --region REGIAO_AWS_LAB \
     --client-vpn-endpoint-id ID_ENDPOINT_LAB \
     --query "Connections[?CommonName == 'CN_DO_BROWAN_CANARIO' && Status.Code == 'active'].{sessao:ConnectionId,ip:ClientIp,inicio:ConnectionEstablishedTime}" \
     --output json --no-cli-pager
   ```

2. Só tentar SSH se a consulta retornar exatamente uma sessão, com `ClientIp` válido dentro do CIDR de clientes configurado para o laboratório. Consulta com erro, zero sessões, duas ou mais sessões ou IP fora do CIDR interrompe a verificação. No mesmo ambiente de rede do backend de teste, verificar se a rota para o IP segue pelo túnel do endpoint de laboratório.

   ```bash
   ip route get IP_VALIDADO_DA_SESSAO
   ```

   Com a rota confirmada, executar o SSH a partir da mesma origem. O arquivo `known_hosts` de laboratório deve conter a chave pública de host já verificada do Browan sob o nome `browan-canario`.

   ```bash
   timeout 20s ssh -F /dev/null -o BatchMode=yes -o ConnectTimeout=8 \
     -o StrictHostKeyChecking=yes -o HostKeyAlias=browan-canario \
     -o GlobalKnownHostsFile=/dev/null \
     -o UserKnownHostsFile=CAMINHO_KNOWN_HOSTS_LAB -o ControlPath=none \
     USUARIO_SSH_LAB@IP_VALIDADO_DA_SESSAO true
   ```

3. Reiniciar o Browan canário. Repetir a consulta, a verificação da rota e o SSH dentro de uma janela definida para o teste. Exigir um `ConnectionId` diferente do anterior e confirmar que a chave de host continua igual. O SSH precisa retornar sucesso para o IP da nova sessão, mesmo se o endereço tiver mudado.

4. Em caso de falha, parar o canário, restaurar o perfil anterior pelo acesso de recuperação e confirmar o retorno do SSH pela rota anterior. Manter o endpoint e os gateways em uso fora das operações do canário. Registrar apenas o resultado do teste e do rollback, sem gravar perfis, credenciais ou a saída bruta da consulta no vault.
