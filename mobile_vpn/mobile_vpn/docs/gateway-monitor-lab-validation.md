# Validação do monitor no gateway de laboratório

Data: 2026-10-29. Escopo: uma execução local do monitor; nenhuma configuração
foi enviada ao equipamento.

## Resultado

- PostgreSQL local saudável e API respondeu `/health` com banco `ok`.
- O scheduler observou 1 gateway e registrou `offline: 1`, sem erro de escrita.
- A chave privada SSH existe e o gateway tem fingerprint cadastrado.
- A porta TCP SSH respondeu no endereço salvo no banco.
- O serviço SSH do monitor recusou o destino antes de abrir SSH, com
  `E_GATEWAY_SSH_ADDRESS_NOT_ALLOWED`. O endereço de gerenciamento não pertence
  às redes definidas em `GATEWAY_SSH_ALLOWED_CIDRS` (ou ao prefixo padrão).

Assim, a execução confirmou o funcionamento do scheduler e da atualização de
status, mas não validou autenticação nem comando SSH no Browan. O bloqueio da
política de destinos foi mantido; nenhum CIDR foi ampliado automaticamente.

## Próxima ação

Obter a sub-rede de gerenciamento aprovada pela empresa para esse gateway e
configurá-la de forma restrita em `GATEWAY_SSH_ALLOWED_CIDRS`. Depois, repetir a
sondagem e confirmar `online` e a observação de WAN. Não incluir redes públicas
ou curingas amplos para contornar a política.

## Revalidação em 2026-10-30

Destino real identificado no banco e rede local: gateway 4, 10.42.0.126. Allowlist local restrita a 10.42.0.126/32. SSH autenticado e fingerprint validada. Backend iniciado com configuração atual; um ciclo real do scheduler confirmou status online, last_seen_at e observação WAN atualizados no banco. API /health respondeu HTTP 200 com banco ok. Evidência: `gateway-monitor-lab-cycle-verification.json`. O bloqueio descrito em 2026-10-29 foi resolvido para o laboratório. Produção requer sua própria allowlist.
