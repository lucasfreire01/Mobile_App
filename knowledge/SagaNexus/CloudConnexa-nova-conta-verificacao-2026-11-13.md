# CloudConnexa: verificação de credenciais — 2026-11-13

- Usuário informou ter preenchido novas credenciais no env. Arquivo local encontrado: `mobile_vpn/.env`; env do backend interno ausente. Nenhum valor de credencial exibido, copiado ou persistido em notas.
- Consulta de autenticação HTTPS no endpoint OAuth da base configurada, usando HTTP Basic como o serviço existente: HTTP 401. Não foi obtido token; consultas de hosts/redes/grupos não foram executadas.
- Sem alterações remotas, reinício de backend ou troca de perfis. Próximo passo: conferir se BASE_URL corresponde ao Cloud ID da conta nova e se Client ID completo/Secret vieram da mesma credencial ativa. Após autenticação bem-sucedida, verificar recursos e planejar migração preservando registros e perfis anteriores.

## Conta saganexus2 confirmada

- Usuário informou Cloud ID `saganexus2`. Alterada exclusivamente CLOUDCONNEXA_BASE_URL no env local para https://saganexus2.api.openvpn.com; demais campos preservados.
- Autenticação OAuth HTTPS com HTTP Basic: HTTP 200. Token usado somente em memória, sem exibir ou persistir.
- Consultas somente leitura: hosts HTTP 200 / 0 registros; networks HTTP 200 / 1 registro; access-groups HTTP 200 / 1 registro.
- CLOUDCONNEXA_ACCESS_GROUP_ID ainda aponta para um grupo que não pertence à nova conta. Não removido nem substituído por grupo amplo automaticamente.
- Nenhum recurso remoto criado/modificado, backend hospedado reiniciado ou perfil VPN trocado. Próximo passo: inspecionar rede/grupo existentes, preparar HOST/connector de backend e política de acesso restrita da nova conta; planejar aplicação no backend hospedado e gateway com backup/rollback.

## Preparação da migração e rollback

- Rede existente: Pink Penguin, id c4445994-6ed3-4b7a-af7a-ef47738f4cf6, conector br-gru. Grupo existente é Default Full Mesh Access Group; não alterado.
- EC2 acessível por SSH com identidade estrita. Release atual: `/opt/saganexus/releases/security-validated-20261110`. saganexus-api e saganexus-network-worker ativos. Nome consultado saganexus-status-worker inativo (não prova ausência de outro monitor). openvpn-client@saganexus-cloud e openvpn-server@saganexus ativos; interfaces VPN presentes. Perfis e env remotos não lidos nem alterados.
- Tentativa autorizada de criação de HOST SagaNexus Backend foi aceita, mas criação do grupo dedicado retornou HTTP 400. HOST recém-criado removido por rollback. Não houve troca de perfil, reinício de serviço ou alteração do grupo no env local.
- Corpo de erro não foi exibido/persistido; próxima etapa deve recuperar apenas campos de validação seguros para corrigir o formato de origem HOST do grupo. Não reutilizar política Full Mesh para contornar o erro.
- Estado final: credenciais da nova conta válidas; migração VPN ainda não aplicada. Limite de oito operações alcançado na etapa.

## Política corrigida e recursos da conta nova preparados

- API apontou `destination[0].parent` como campo inválido na tentativa que usava a rede do onboarding. Essa rede é egress=true e tem zero serviços privados. Preservada integralmente.
- Consulta somente leitura no backend: único cadastro retornado foi gateway id=25, nome Teste, gestão 10.200.0.2 e status armazenado online. Esse status não substitui verificação de SSH/tráfego real e não comprova causa da queda anterior.
- Criados e validados recursos separados na saganexus2: HOST SagaNexus Backend `517304bb-5c11-42db-a330-5eaf6047f5d5`; conector backend `e7c862fa-aea3-48a2-abbf-1f375b73388c`; rede privada SagaNexus Gateway Teste `1978969b-fe2b-4487-83e5-20d899bb7020`; conector gateway `761644d1-288e-4d5c-893f-b76172ba861b`; serviço SSH `9030cd59-e9e3-4548-8e5b-a5f1c835861d` para 10.200.0.2/32; grupo `a453bbba-a31a-4e91-b967-647b5eea6b78`.
- Origem correta do grupo: HOST com parent apontando ao HOST específico, allCovered=true dentro dele. Destino: somente o serviço SSH selecionado na nova rede, allCovered=false e children com um serviço. Escopo confirmado por GET após criação.
- Atualizado somente CLOUDCONNEXA_ACCESS_GROUP_ID no env local. Perfis, serviços, env do backend hospedado e cadastro 25 ainda não alterados. Criar recursos na API não significa conexão VPN estabelecida.
- Próxima etapa: preparar backups restritos e transferir os perfis diretamente aos respectivos endpoints sem mostrar/gravar segredos em notas; aplicar com rollback, atualizar credenciais/binding do backend hospedado e validar SSH do backend ao gateway e API visível no app. Limite de oito operações da etapa alcançado.

## Perfis e backups preparados, ainda sem ativação

- Servidor confirmado: perfil ativo `/etc/openvpn/client/saganexus-cloud.conf`, serviço openvpn-client@saganexus-cloud, rota restrita 10.200.0.2/32 com route-nopull.
- Cadastro 25 confirmado: Teste, gestão 10.200.0.2, provider cloudconnexa. Vínculos antigos: networkId 574faed5-5ddc-4d43-b763-a5d4e802a009; connectorId 36132057-09a3-466f-9796-7bbaad69fe9f; routeId 52b722d6-221e-4651-b632-777708528645.
- Gateway físico autenticado por chave conhecida em 10.43.0.126: IP 10.200.0.2/32 presente em lo; `/etc/openvpn/client.conf` e `/etc/init.d/S90openvpn` existentes. Relógio UTC alinhado ao PC.
- Perfil do novo HOST gerado por POST /api/v1/hosts/connectors/{id}/profile; certificado/chave conferidos em memória e transferidos por stdin sobre SSH, sem arquivo secreto na estação.
- Área root-only do servidor: `/var/backups/saganexus/connexa2-20261113T160034830Z-28321c`. Contém old-backend.conf, old.env, old-binding.json, new-backend.conf, new.env e metadata.json, todos privados. Env novo contém somente alterações VPN_PROVIDER/CLOUDCONNEXA; binding antigo salvo, banco não alterado.
- Perfil do novo conector da rede gerado pela API e transferido diretamente ao gateway. Área privada: `/etc/saganexus/migration-saganexus2-20261113`, arquivos old-gateway.conf e new-gateway.conf. Certificado/chave conferidos em memória. Perfis novos normalizados para IPv4; perfil backend mantém rota restrita à gestão.
- Não houve troca de perfil ativo, reinício de serviço, alteração do env em uso ou update no banco. Nenhum segredo em saída/notas.
- Próxima etapa deve validar o env preparado e os backups, ativar perfis com rollback, atualizar env/binding do cadastro 25 e testar CloudConnexa, SSH real do backend ao gateway e endpoint hospedado. Não tratar arquivos preparados como migração concluída. Limite de oito operações da etapa atingido.
