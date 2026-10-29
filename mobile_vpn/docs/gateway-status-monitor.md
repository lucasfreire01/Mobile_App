# Monitoramento SSH com limites

O job `app/jobs/gateway_status_job.ts` substitui a leitura de todos os gateways
de uma vez por lotes ordenados por ID. Cada processo mantém um conjunto limitado
de workers, e cada sondagem usa uma única conexão para confirmar SSH e observar
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

Esses limites são **por processo**, não uma coordenação distribuída entre réplicas.
Em uma implantação com várias APIs, ainda será necessário executar o scheduler
em uma instância dedicada ou adicionar coordenação distribuída. O orçamento de
ciclo controla despacho e cancelamento SSH; não é um SLA absoluto quando o banco
está indisponível ou demorando para fornecer uma conexão.

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
e budgetExhausted, sem endereços ou credenciais. `checked` conta sondagens concluídas
antes do orçamento, não o número de registros efetivamente alterados.

## Verificação

Testes em `tests/unit/gateway_status_job.spec.ts` verificam lotes, concorrência,
falhas, deadlines, sobreposição, retomada, mudança de IP e configuração inválida.
`tests/unit/gateway_status_probe.spec.ts` usa um cliente SSH falso para verificar
conexão única, encerramento ao cancelar e tratamento de WAN inválida/indisponível.

A regressão usa PostgreSQL temporário e SSH simulado; nenhuma conexão a gateway
real é iniciada por esses testes. Não foi executado benchmark de frota real nem
validação de monitoramento distribuído. Não há migração ou nova dependência.

Evidência: [checks finais](gateway-monitor-verification.json).

Referências consultadas: [toad-scheduler](https://github.com/kibertoad/toad-scheduler)
e [ssh2](https://github.com/mscdex/ssh2).
