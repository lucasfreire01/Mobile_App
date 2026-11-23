# Canário Azure VPN Gateway P2S com Browan

O adaptador `azure_vpn_gateway_p2s` vincula um Browan com túnel já configurado. Ele consulta a sessão OpenVPN pelo nome exato que a Azure informa em `vpnUserName` e usa o IP privado somente quando há uma sessão inequívoca no CIDR autorizado para SSH. O SagaNexus guarda a identidade da conexão e a chave de host. O endereço da sessão pode mudar a cada reconexão.

## Configuração de laboratório

1. Preparar um Azure VPN Gateway de laboratório com OpenVPN e autenticação por certificado. Instalar no Browan canário o perfil e um certificado com identidade exclusiva para esse dispositivo. A emissão, a instalação e a revogação desses certificados ficam com o operador. [OpenVPN no Linux com certificado](https://learn.microsoft.com/en-us/azure/vpn-gateway/point-to-site-vpn-client-certificate-openvpn-linux)
2. Instalar a Azure CLI no ambiente do backend e do worker de status. Configurar a identidade de execução com acesso à consulta de sessões no gateway de laboratório. A operação está em `Microsoft.Network/virtualNetworkGateways/getVpnClientConnectionHealth/action`. Verificar no laboratório também as permissões de leitura e de acompanhamento da operação assíncrona exigidas pela CLI. [Permissões de rede da Azure](https://learn.microsoft.com/en-us/azure/role-based-access-control/permissions/networking)
3. Configurar `AZURE_P2S_VPN_GATEWAY_RESOURCE_ID` com o identificador ARM completo do gateway de laboratório e incluir o CIDR do pool P2S nas faixas de gerenciamento permitidas em `GATEWAY_SSH_ALLOWED_CIDRS`. Confirmar que o backend tem rota e permissão de rede para iniciar SSH até o pool. O adaptador é selecionado explicitamente no vínculo administrativo.
4. A partir do ambiente do worker, consultar o estado da sessão. A CLI classifica o comando como Preview. Ela aguarda o resultado de uma operação que pode ser assíncrona. Medir o tempo de execução e, se necessário, ajustar `AZURE_P2S_VPN_LOOKUP_TIMEOUT_MS` entre 1.000 e 60.000 ms. O padrão é 10.000 ms. Ajustar também `GATEWAY_MONITOR_TIMEOUT_MS` para comportar a consulta e a conexão SSH. A Azure atualiza o estado das sessões a cada cinco minutos. [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/network/vnet-gateway/vpn-client#az-network-vnet-gateway-vpn-client-show-health) · [Operação assíncrona](https://learn.microsoft.com/en-us/rest/api/network-gateway/virtual-network-gateways/get-vpnclient-connection-health) · [Gerenciamento de sessões P2S](https://learn.microsoft.com/en-us/azure/vpn-gateway/p2s-session-management)

   ```bash
   az network vnet-gateway vpn-client show-health \
     --ids "$AZURE_P2S_VPN_GATEWAY_RESOURCE_ID" --output json --only-show-errors
   ```

5. Vincular pelo endpoint administrativo `POST /api/v1/gateways/attach` com `providerId: "azure_vpn_gateway_p2s"`, `name`, `reference` igual ao `vpnUserName` observado e `sshHostKeyFingerprint` obtida pelo canal de administração já confiável. Omitir `managementIpAddress`. O backend exige um único registro com a identidade exata e o prefixo de sessão `OVPN_` mostrado na documentação oficial. A autenticação por certificado vem da configuração do gateway de laboratório. [Exemplo oficial de sessão OpenVPN](https://learn.microsoft.com/en-us/powershell/module/az.network/get-azvirtualnetworkgatewayvpnclientconnectionhealth#example-1)
6. Confirmar acesso SSH pelo backend com a chave de host esperada e status online no monitor. Reiniciar o Browan, aguardar a atualização da Azure e repetir a prova com a nova sessão. A remoção do vínculo no SagaNexus deixa o túnel ativo e o certificado com o operador. Para o rollback de laboratório, remover o vínculo e restaurar o perfil anterior pelo canal de recuperação.

O adaptador foi exercitado com respostas simuladas da Azure. `npm run typecheck` passou. Em PostgreSQL isolado, `npm test -- --files=azure_vpn_gateway_p2s_provider.spec.ts` passou com 6 testes e a regressão direcionada `gateway_ssh_address.spec.ts` passou com 10 testes antes do ajuste de timeout. Este ambiente não tem a Azure CLI no PATH e ainda não houve canário com Browan e Azure reais.

## Dez integrações por topologia

| Integração | Topologia e trabalho restante |
| --- | --- |
| CloudConnexa | Adaptador gerenciado existente para conectores OpenVPN. [Conectores de rede](https://openvpn.net/cloud-docs/owner/get-started/about-cloudconnexa/network-connectors-for-routers/) |
| OpenVPN em EC2 | Adaptador existente com provisionador próprio. A operação depende de uma instalação compatível e de validação em campo. |
| Azure VPN Gateway P2S | Adaptador de vínculo com sessão OpenVPN implementado. Falta canário com certificado, rota e reinicialização. [Cliente OpenVPN](https://learn.microsoft.com/en-us/azure/vpn-gateway/point-to-site-vpn-client-certificate-openvpn-linux) |
| AWS Client VPN | Candidato a vínculo por sessão OpenVPN após comprovar identidade, rota e acesso SSH entre clientes. [AWS Client VPN](https://docs.aws.amazon.com/vpn/latest/clientvpn-admin/how-it-works.html) |
| Google Cloud HA VPN | Site a site IPsec. Precisa de peer IPsec, túnel e rotas até a rede Browan. [Google Cloud VPN](https://docs.cloud.google.com/network-connectivity/docs/vpn/concepts/overview) |
| AWS Site-to-Site VPN | Site a site IPsec com customer gateway e rotas até a rede Browan. [AWS Site-to-Site VPN](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html) |
| Azure VPN Gateway S2S | Site a site IPsec/IKE com peer e roteamento. [Topologias Azure VPN Gateway](https://learn.microsoft.com/en-us/azure/vpn-gateway/design) |
| OCI Site-to-Site VPN | Site a site IPsec com CPE e DRG. [OCI Site-to-Site VPN](https://docs.oracle.com/en-us/iaas/Content/Network/Tasks/overviewIPsec.htm) |
| Tailscale | Candidato a rede de sobreposição com roteador de sub-rede quando o Browan não roda o cliente. [Subnet routers](https://tailscale.com/docs/features/subnet-routers) |
| WireGuard autogerenciado | Candidato a peer com IP de gerenciamento roteado. A instalação do cliente e a gestão de chaves dependem do firmware e do provisionador escolhido. [WireGuard](https://www.wireguard.com/) |
