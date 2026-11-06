# Gateway 4 offline no app — diagnóstico de 2026-11-03

- Backend consulta SSH em `10.200.0.2`; confirmado por consulta somente leitura ao banco.
- Após reinício do computador faltava rota para esse IP. Usuário adicionou rota temporária `/32` via `100.96.1.65 dev tun0`; confirmada em runtime.
- Após adicionar a rota, SSH pela VPN retorna conexão recusada; monitor permanece offline.
- Gateway acessível por SSH em `10.42.0.126`, com chave de host validada pelo fingerprint cadastrado. IP `10.200.0.2/32` presente, SSH escutando em todas as interfaces e regra INPUT permitindo TCP 22.
- CloudConnexa: rede do gateway anuncia `10.200.0.2/32`; conector do gateway ONLINE e sessão Active confirmada.
- CloudConnexa: conector `saganexus-backend-connector` do host `SagaNexus Backend` OFFLINE, confirmado também por GET individual do conector. Grupo SagaNexus Gateways autoriza esse host como origem e o serviço SSH do gateway como destino.
- Falha localizada no caminho de acesso do backend pela VPN: o gateway estar ONLINE no provedor não torna seu SSH alcançável pelo monitor. Interface local tun0 ativa não comprova conexão do conector correto.
- `openvpn3 sessions-list` não encontrou sessões para o usuário consultado. Não foi estabelecida a origem/propriedade de tun0 nem a causa da desconexão do conector do backend.
- Próximo passo: identificar e restabelecer a conexão do conector do backend correto; confirmar SSH e status do monitor antes de persistir rotas. Nenhuma alteração de conta ou firewall feita nesta investigação.
- Evidências de runtime são datadas; conferir novamente antes de mudanças.

## Causa confirmada e recuperação

- Boot executava `openvpn3-session@CloudConnexa.service` (root); usuário possuía perfil importado `SagaNexus Backend`, sem sessão ativa.
- Serviço CloudConnexa parado com `systemctl stop openvpn3-session@CloudConnexa.service` e perfil correto iniciado com `openvpn3 session-start --config 'SagaNexus Backend'`.
- Perfil SagaNexus Backend conectou; teste imediato em `10.200.0.2:22` retornou banner SSH válido, confirmando recuperação do acesso após troca de perfil.
- Pendente: corrigir inicialização automática para usar o perfil correto e conferir rotas após novo boot. Não foi alterado enable/disable de serviços.

## Inicialização permanente aplicada; aguardando teste após reboot

- Etapa posterior concluiu a configuração: serviço de sistema `openvpn3-session@CloudConnexa.service` desabilitado no boot.
- Criado e habilitado serviço do usuário `saganexus-vpn.service`, executando o helper nativo OpenVPN 3 com perfil literal `SagaNexus Backend`. `Linger=yes` confirmado.
- Monitor recebeu dependência Wants/After da VPN; web recebeu override para porta 8081 em localhost (original usava 8083).
- Processos manuais de web e monitor encerrados; serviços permanentes assumiram.
- Verificação final: VPN, monitor e web `active/running/enabled`; perfil antigo `disabled`; web HTTP 200; banco indica gateway 4 `online`.
- Usuário vai reiniciar e voltar. Conferir boot sem iniciar processos manualmente: aguardar cerca de 1 minuto e acessar http://localhost:8081. Boot real ainda pendente. Se offline, verificar endereço e rota atual; a rota adicionada antes era temporária e o próximo salto pode mudar.
