# Monitoramento SSH com limites

O job `app/jobs/gateway_status_job.ts` substitui a leitura de todos os gateways
de uma vez por lotes ordenados por ID. Uma concessão PostgreSQL seleciona um dono entre as réplicas; ele mantém
um conjunto limitado de workers, e cada sondagem usa uma única conexão para confirmar SSH e observar
a WAN. Não envia configurações ao dispositivo.

## Valores padrão

| Variável | Padrão | Limite aceito |
|---|---:|---:|
| GATEWAY_MONITOR_CONCURRENCY | 5 | 1–20 |
| GATEWAY_MONITOR_BATCH_SIZE | 50 | 1–500 |
| GATEWAY_MONITOR_TIMEOUT_MS | 15000 | 1–60000 |
| GATEWAY_MONITOR_CYCLE_TIMEOUT_MS | 100000 | 1–110000 |

Valores precisam ser inteiros positivos. O scheduler continua executando a cada
2 minutos, com prevenção explícita de sobreposição. O próprio job também recusa
uma chamada concorrente na mesma instância.

O timeout por sondagem cancela a conexão/execução SSH, em vez de apenas abandonar
uma Promise. O orçamento do ciclo interrompe novas sondagens e cancela as que
estiverem em andamento. O cursor retoma depois dos gateways já iniciados no ciclo
seguinte, retornando ao início após alcançar o final da lista.

As réplicas que compartilham o banco disputam atomicamente a concessão
`gateway-status`; somente o dono inicia o ciclo. O orçamento controla despacho
e cancelamento SSH; não é um SLA absoluto quando o banco está indisponível ou
demorando para fornecer uma conexão.

## Atualizações de estado

- Falha ao estabelecer SSH marca offline; preserva o último `lastSeenAt`.
- SSH estabelecido mantém online mesmo se não houver WAN válida, preservando a
  semântica anterior de ping seguido por leitura opcional da WAN.
- WAN válida atualiza o endereço e sua data de observação.
- Cancelamento por orçamento do ciclo não marca equipamentos como offline.
- Se o IP de gerenciamento mudou durante a sondagem, a atualização condicionada
  ao IP anterior não sobrescreve o estado do novo endereço.
- A resposta do comando WAN é limitada a 512 caracteres e exige IPv4 válido.

O evento `gateway_status_cycle` registra checked, offline, writeErrors, skipped
e budgetExhausted, além de leaseLost, sem endereços ou credenciais. `checked` conta sondagens concluídas
antes do orçamento, não o número de registros efetivamente alterados.

## Verificação

Testes em `tests/unit/gateway_status_job.spec.ts` verificam lotes, concorrência,
falhas, deadlines, sobreposição, retomada, mudança de IP e configuração inválida.
`tests/unit/gateway_status_probe.spec.ts` usa um cliente SSH falso para verificar
conexão única, encerramento ao cancelar e tratamento de WAN inválida/indisponível.

A regressão usa PostgreSQL temporário e SSH simulado; nenhuma conexão a gateway
real é iniciada por esses testes. Em 2026-10-30, duas APIs locais com banco
compartilhado também foram validadas contra o gateway real: uma sondou e a outra
pulou o ciclo. Não foi executado benchmark de frota nem validação em produção.
A tabela de coordenação exige migração; nenhuma dependência foi adicionada.

Evidência: [checks finais](gateway-monitor-verification.json).

Referências consultadas: [toad-scheduler](https://github.com/kibertoad/toad-scheduler)
e [ssh2](https://github.com/mscdex/ssh2).

## Coordenação entre réplicas — 2026-10-30

`gateway_monitor_states` guarda token da concessão, vencimento e cursor. A aquisição usa INSERT/ON CONFLICT condicional e relógio do PostgreSQL. A duração é o orçamento do ciclo mais 30 segundos (130 segundos no padrão; máximo de 140). Não há renovação durante o ciclo. Em encerramento normal, libera o token preservando o cursor; após queda, outra réplica pode assumir no próximo agendamento depois do vencimento.

O cursor avança antes de despachar cada sondagem e é compartilhado entre processos. Atualizações concorrentes usam GREATEST para não regredir; ao chegar ao final do inventário, volta a zero. Um item despachado antes de uma queda pode ser revisitado na próxima volta completa.

Avanços e publicações validam token e validade em transações curtas. A linha da concessão fica bloqueada até o commit da publicação, impedindo corrida entre um resultado antigo e a posse nova. O IP do gateway também deve continuar igual. A expiração é reavaliada depois de obter o bloqueio, e um dono antigo não consegue liberar o sucessor. Transações usam lock_timeout e statement_timeout de 5 segundos; nenhuma transação permanece aberta durante o SSH. Falha no despacho cancela e aguarda as sondagens ativas antes de liberar a posse.

A exclusão vale para donos de concessões válidas no mesmo banco. Um processo suspenso além do vencimento não é interrompido remotamente; seus resultados atrasados são rejeitados. Esse mecanismo é independente das travas de aplicação de configuração de rede.

### Implantação

Aplicar `1793400000000_create_gateway_monitor_state`, conceder somente SELECT/INSERT/UPDATE na nova tabela ao papel de execução e substituir todos os processos antigos antes de considerar a coordenação ativa. Réplicas antigas ignoram a concessão; uma mistura de versões não fornece essa coordenação. O provisionamento de permissões já inclui a tabela, sem grants de DELETE, sequência ou DDL. A validação local aplicou a migração e os grants sem trocar credenciais.

Testes: `tests/unit/gateway_monitor_lease.spec.ts`, `gateway_status_job.spec.ts` e `tests/database_runtime_security.test.mjs`. Evidência: `gateway-monitor-replicas-verification.json`. Regressão completa: 96 testes aprovados. A segunda API temporária foi encerrada; a principal ficou saudável.
