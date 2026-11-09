# Provedores VPN substituíveis

Atualizado em 2026-10-30. O backend usa o contrato `VpnProvider`; CloudConnexa é o adaptador incluído e o padrão. Um segundo serviço real precisa de seu próprio adaptador, pois APIs e modelos de recursos diferem entre fornecedores.

## Seleção e vinculação

`config/vpn.ts` registra fábricas de adaptadores. `VPN_PROVIDER` escolhe o padrão para novos gateways. A inicialização valida o adaptador selecionado e suas credenciais locais, sem autenticar nem provisionar na API externa.

Cada gateway persiste `vpnProvider` e `vpnResources`. Cada reserva de IP também persiste o provedor. Trocar o padrão não migra gateways existentes: perfis, exclusão, atualização de rotas e limpeza de reservas continuam usando o vínculo original. O cliente HTTP não escolhe nem altera esse vínculo no payload de cadastro/edição.

Se um adaptador vinculado estiver ausente, a operação falha com `E_VPN_PROVIDER_NOT_CONFIGURED`; não usa o padrão como fallback. Operações de rede com adaptador indisponível falham antes das chamadas SSH. Manter adaptadores e credenciais necessários aos gateways e reservas existentes ao mudar o padrão.

## Contrato

Arquivo: `app/services/vpn/types.ts`.

| Método | Responsabilidade |
| --- | --- |
| `createGateway(name, managementIp, onNetworkCreated)` | Criar recursos exclusivos do gateway e devolver `networkId`, `connectorId`, `routeId`. |
| `getProfile(connectorId)` | Devolver `{ content, format }`, com formato `openvpn` ou `wireguard`. |
| `deleteGateway(networkId)` | Excluir somente os recursos pertencentes ao gateway; ausência remota deve ser tratada como sucesso. |
| `updateRoutes(routeId, routes)` | Substituir as rotas do recurso específico do gateway pela lista recebida. |

Os identificadores são handles opacos do adaptador. `networkId` identifica um conjunto de recursos exclusivo daquele gateway; em serviço com servidor VPN compartilhado, ele pode identificar o peer/túnel a excluir, nunca o servidor compartilhado inteiro. `connectorId` identifica o recurso do perfil, e `routeId` o recurso de rotas. O adaptador faz o mapeamento para sua API. O identificador de rede deve caber no campo de reserva existente (`varchar(255)`).

Após criar o primeiro recurso remoto, o adaptador deve aguardar `onNetworkCreated(id)` antes de prosseguir. Isso permite guardar o ID para compensação/limpeza após falhas. Só lançar `VpnProvisioningRejectedError` quando houver certeza de rejeição sem criação de recursos. Timeout, conexão interrompida ou resultado desconhecido devem lançar erro comum; o IP continuará reservado para reconciliação. Se o ID já for conhecido, a compensação usa o mesmo adaptador, e uma falha de limpeza mantém a reserva.

Segredos ficam na configuração de execução e no armazenamento seguro de credenciais escolhido pelo adaptador, não nos identificadores. O backend persiste somente os três campos permitidos de `vpnResources`; propriedades extras retornadas pelo adaptador não entram no banco ou na resposta de cadastro. Não registrar tokens nem conteúdo de perfis.

## Adicionar um serviço

1. Criar `app/services/vpn/minha_vpn_provider.ts` implementando `VpnProvider`, com `id` estável, minúsculo, até 64 caracteres (`a-z`, números, `_`, `-`, começando por letra).
2. Registrar uma fábrica em `config/vpn.ts`, preservando as existentes:

```ts
minha_vpn: async () => {
  const { default: MinhaVpnProvider } = await import('#services/vpn/minha_vpn_provider')
  return new MinhaVpnProvider()
},
```

3. Declarar variáveis próprias em `start/env.ts`. Validar credenciais no adaptador quando selecionado/resolvido, de modo que um provedor não exija credenciais de outro. A CloudConnexa exige suas três credenciais somente quando seu adaptador é usado.
4. Configurar `VPN_PROVIDER=minha_vpn`, testar o adaptador com sua API e reiniciar API e worker. Nenhuma regra de provisionamento, reserva de IP, fila, controlador ou app precisa ser reescrita para adicionar uma implementação do contrato.
5. Validar criação, falhas parciais/ambíguas, exclusão idempotente, escopo de rotas e perfil no ambiente do fornecedor antes de provisionar gateways reais.

O perfil é entregue pela rota administrativa existente `GET /api/v1/gateways/:id/vpn-profile`, com `Cache-Control: no-store`: OpenVPN usa `.ovpn` e `application/x-openvpn-profile`; WireGuard usa `.conf` e `text/plain`. O script atual `scripts/provision_gateway.sh` instala OpenVPN. Uma integração que use outro protocolo também precisa de validação do cliente/instalação no equipamento; entregar `.conf` pela API não instala WireGuard no gateway.

## Compatibilidade e implantação

Migração: `1793500000000_bind_vpn_providers`. Gateways e reservas existentes ficam vinculados a `cloudconnexa`. Os IDs `ccNetworkId`, `ccConnectorId`, `ccIpServiceId` são preservados; a camada de compatibilidade os resolve quando `vpnResources` é nulo. Novos cadastros CloudConnexa preenchem os campos antigos e os genéricos; outros adaptadores deixam os antigos nulos. Não retirar os campos antigos nesta etapa.

Aplicar a migração antes de iniciar os processos atualizados. As permissões existentes das tabelas cobrem as novas colunas, sem DDL adicional para o runtime. Substituir versões antigas de API/worker antes de selecionar um novo padrão; versões antigas ignoram os vínculos de provedor. Não reverter a migração após criar vínculos não CloudConnexa sem preservar e reconciliar esses dados.

## Validação em 2026-10-30

- 105 testes aprovados em PostgreSQL descartável, sem criar VPNs externas.
- Adaptadores simulados alpha/beta: troca do padrão, vínculo original em perfil/exclusão/rotas/limpeza, resultado ambíguo, rejeição definitiva, metadados incompletos, adaptador ausente e remoção de propriedades privadas extras.
- Compatibilidade CloudConnexa validada pela suíte anterior e por perfis/IDs legados com fornecedor padrão alternativo.
- Lint, TypeScript e build backend aprovados. Teste de permissões com DML sintético e rollback aprovado, incluindo JSONB dos recursos.
- Migração local preservou os identificadores e reservas existentes. API reiniciada com CloudConnexa padrão, saudável; app web validou login/lista/detalhe sem exceções JS.
- Segundo provedor real, provisionamento real na CloudConnexa nesta etapa e instalação nativa de outro protocolo permanecem sem validação.

Evidências: `vpn-provider-verification.json`, `vpn-provider-migration-verification.json`, `vpn-provider-runtime-verification.json`, `vpn-provider-web-verification.json` e `backend-regression-result.json`.
