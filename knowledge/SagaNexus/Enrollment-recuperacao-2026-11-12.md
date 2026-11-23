# Enrollment: recuperação — 2026-11-12

- Gateway WSMS-155, cadastro hospedado id=24 (Teste): backend confirmou status online após recuperação. Enrollment concluído, configuração pendente removida, VPN ativa e rota de retorno instalada. Não foi forçado status no banco.
- Configuração pendente continha código rejeitado por HTTP 404. Código renovado no backend e enviado ao gateway por SSH sem exibição; cadastro preservado.
- Firmware estava com vpn.client.vpn_enable=0. Agente reiniciava OpenVPN antes de habilitar o cliente e saía aguardando tun0. Removida instalação/reinicialização antecipada duplicada; normalização IPv4 ocorre no perfil validado antes do fluxo existente de instalação atômica, habilitação e rollback.
- Chave pública antiga da EC2 não correspondia à chave Ed25519 usada pelo backend ativo. Autorizada a chave pública derivada da configuração ativa; nenhuma chave privada transferida. A automação de autorização dessa chave em gateways novos ainda precisa ser tratada no pacote.
- PC usa NetworkManager browan-lab com ipv4.method=shared: há internet compartilhada pelo cabo. Orientação anterior de ausência de internet nessa ligação estava incorreta.
- Testes: `python3 -m unittest scripts/tests/test_enrollment_agent.py -v`: 4 aprovados (habilitação antes do início, perfil inválido, rollback de falha VPN e retenção em falha de conclusão). `sh -n scripts/gateway_enrollment_agent.sh` e diff direcionado sem erros.
- Agente corrigido instalado atomicamente no gateway após testes e validação de sintaxe, com backup protegido do anterior. Nenhum build APK iniciado. Operação independente com cabo no roteador ainda requer confirmação física após a troca.
