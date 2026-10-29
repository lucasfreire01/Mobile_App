# Cadastro concorrente e reserva do IP de gerenciamento

O cadastro mantém `POST /api/v1/gateways` e a resposta 201 existente. IP ocupado
ou reservado retorna 409, inclusive em requisições simultâneas. Cadastros sem IP
recebem endereços diferentes do pool configurado.

## Fluxo

1. Uma transação curta serializa a escolha do IP, verifica gateways e reservas,
   e grava a reserva com um token exclusivo. Não faz chamadas externas.
2. A CloudConnexa é chamada fora da transação. Assim que retorna o ID da rede,
   esse ID é associado à reserva. Cada chamada HTTP tem timeout de 10 segundos.
3. Outra transação cria o gateway com os IDs remotos e remove a reserva.
4. Se ocorrer falha depois de conhecer o ID da rede, a aplicação tenta remover
   essa rede, incluindo os recursos dependentes. Se conseguir, libera o IP.

O índice único `gateways_management_ip_address_unique` protege o banco mesmo
quando uma gravação não passa pela pré-consulta da API. A comparação usa `inet`,
incluindo grafias equivalentes de IPv6. Endereços nulos continuam permitidos para
registros legados. Updates pela API também recusam endereços reservados.

## Falhas e recuperação

Uma falha na remoção externa não é ignorada: a reserva permanece em
`cleanup_required`, com o ID da rede, e a API retorna 503. Isso bloqueia novas
tentativas com o mesmo IP até a limpeza. Para tentar novamente:

```bash
node ace gateway:provisioning-cleanup
```

Esse comando usa a credencial runtime e tenta DELETE somente das redes registradas
em `cleanup_required`. Não inicia provisionamentos. DELETE que já retorna 404 é
tratado como remoção concluída. Falhas mantêm a reserva e fazem o comando falhar;
duas execuções concorrentes usam locks por registro para evitar trabalho duplicado.

Se uma resposta de criação se perder antes de retornar o ID da rede, o resultado
é incerto: a reserva fica em `reconciliation_required` e a API retorna 503. Ela
não expira automaticamente e não dispara outro POST às cegas. O operador precisa
conferir o estado remoto antes de liberar ou completar essa reserva.

Uma interrupção do processo pode deixar a reserva em `provisioning`; também exige
conferência antes de qualquer remoção manual. Uma indisponibilidade simultânea do
banco e do provedor não permite garantir compensação automática. Esta mudança
não oferece uma transação distribuída nem prova eliminação de todos os recursos
remotos em cenários de crash. Ela registra as pendências conhecidas e impede
reutilização prematura do IP.

## Migração e permissões

A migração `1793300000000_reserve_gateway_management_ips` cria o índice e a tabela
`gateway_ip_reservations`. Ela falha em vez de apagar ou escolher entre duplicatas
existentes; confira dados inválidos/duplicados antes de migrar outro ambiente.

Após a migração administrativa, execute `npm run db:runtime:prepare` para
reconciliar os grants. O runtime recebe SELECT, INSERT, UPDATE, DELETE e USAGE
na sequência dessa nova tabela, sem receber permissões de DDL.

Não remova a tabela por rollback enquanto houver reservas ou limpezas pendentes.
Faça o deploy de código e schema em uma janela coordenada: o código novo precisa
da tabela e dos grants, e o código antigo não respeita reservas pendentes.

## Validação

`tests/functional/gateway_provisioning.spec.ts` cobre:

- Apenas um provisionamento para duas tentativas simultâneas do mesmo IP: 201/409.
- Endereços automáticos diferentes em cadastros concorrentes.
- Unicidade diretamente no PostgreSQL e conflitos em updates.
- Remoção de recursos parciais e compensação de falha ao persistir o gateway.
- Persistência da pendência quando o DELETE falha, bloqueio do IP e retry posterior.
- Resultado incerto preservado para reconciliação e rejeição definitiva liberando a reserva.

A suíte completa passou com **73 testes** em banco temporário e CloudConnexa
simulada; lint, TypeScript e build passaram. A migração foi aplicada no ambiente
local após conferir ausência de duplicatas. Não foram provisionados ou removidos
recursos reais da CloudConnexa, nem aplicadas configurações nos gateways.

Evidência local: [verificação da migração e permissões](gateway-ip-reservations-verification.json).
