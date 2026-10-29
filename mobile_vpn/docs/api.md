# Contrato da API

Base URL local: `http://localhost:3333/api/v1`.

Salvo `POST /auth/login` e `GET /health`, as rotas exigem:

```http
Authorization: Bearer <access-token>
```

Obtenha o token com `POST /auth/login`:

```json
{ "email": "admin@example.com", "password": "senha" }
```

A resposta contém `data.token`. Resposta `401` significa token ausente, inválido
ou expirado.

O cadastro público (`POST /auth/signup`) está desativado. Tokens novos expiram
em 24 horas; o login aceita até 10 requisições por minuto por IP e responde
`429` ao exceder o limite. Em produção, o limitador sempre usa o banco.

As rotas de gateways (inclusive consultas, perfis VPN, Ethernet, operações,
alertas e rotação de chaves SSH) e `/health/queue` exigem `is_admin = true`.
Uma conta autenticada sem essa permissão recebe `403`. Perfil e logout
continuam disponíveis para qualquer conta autenticada.

### Aplicação das correções de segurança

Execute `node ace migration:run` antes de iniciar a versão atualizada. A migração
mantém todas as contas sem privilégios administrativos e expira tokens antigos
que não tinham validade. Aprove explicitamente uma conta existente e confiável
com `node ace user:grant-admin email-do-administrador`. O seeder de desenvolvimento
também aprova a conta configurada em `SEED_ADMIN_EMAIL`; não o use para provisionar
produção, pois ele substitui a senha pela configuração de desenvolvimento.

SSH aceita apenas IPs literais nos CIDRs de `GATEWAY_SSH_ALLOWED_CIDRS`, separados
por vírgula. Sem essa variável, permite somente `<GATEWAY_MGMT_IP_PREFIX>.0/24`
(prefixo padrão `10.200.0`). Cadastros e alterações de IP são validados antes de
provisionar recursos; cada conexão SSH também é validada, inclusive operações
antigas na fila. Para aplicar um IP estático de LAN, autorize a sub-rede específica
antes da operação. Não configure redes amplas que incluam serviços internos.

## Health

### `GET /health`

Não exige autenticação. Informa se aplicação e banco estão acessíveis.

```json
{ "status": "ok", "database": "ok" }
```

### `GET /health/queue`

Exige autenticação. Informa a saúde do worker de rede.

```json
{
  "status": "ok",
  "queue": {
    "pending": 0,
    "applying": 0,
    "failed": 0,
    "expiredLeases": 0,
    "recentHostKeyMismatches": 0,
    "openHostKeyMismatchAlerts": 0,
    "oldestPendingSeconds": null
  },
  "worker": {
    "name": "gateway_network_operations_worker",
    "status": "ok",
    "lastSeenAt": "2026-10-27T12:00:00.000-03:00",
    "ageSeconds": 4
  }
}
```

`status: "degraded"` não bloqueia a API: ele avisa sobre worker parado, lease
expirado, fila antiga ou alerta de segurança aberto.

## Ethernet e operações assíncronas

Use o recurso aninhado para salvar configuração:

- `GET /gateways/:gatewayId/ethernet`
- `POST /gateways/:gatewayId/ethernet`
- `GET /gateways/:gatewayId/ethernet/:id`
- `PUT /gateways/:gatewayId/ethernet/:id`

Exemplo estático:

```json
{
  "mode": "static",
  "dhcpFallbackEnabled": false,
  "staticIpAddress": "10.42.0.126",
  "staticPrefixLength": 24,
  "staticGateway": "10.42.0.1",
  "primaryDns": "10.42.0.1",
  "secondaryDns": "1.1.1.1"
}
```

Em `mode: "dhcp"`, os campos estáticos são opcionais. Se
`dhcpFallbackEnabled` for `true`, endereço, prefixo, gateway e DNS primário são
obrigatórios: eles formam o perfil local de recuperação quando DHCP falha.

Salvar não altera o equipamento. Para colocar a configuração na fila, use:

### `POST /gateways/:id/ethernet/apply`

Retorna `202 Accepted`; a execução é feita pelo worker, separado do HTTP.

```json
{
  "message": "Ethernet configuration queued.",
  "operation": {
    "id": 15,
    "gatewayId": 4,
    "action": "apply_static",
    "status": "pending",
    "attempts": 0
  }
}
```

Se o gateway já tiver operação `pending` ou `applying`, retorna `409 Conflict`.

### `GET /gateways/:id/network-operations?page=1&limit=20`

Lista operações da mais recente para a mais antiga. `limit` aceita 1 a 100.
Estados: `pending`, `applying`, `applied` e `failed`.

Campos úteis: `attempts`, `errorCode`, `errorMessage`, `payload`,
`previousPayload`, `requestedByUserId`, `requestedByEmail`, `startedAt` e
`finishedAt`.

## Chave SSH do gateway

Cada gateway pode ter uma fingerprint SSH `SHA256:...` fixada. O backend rejeita
conexões se a chave apresentada pelo equipamento não for a registrada.

Não use `PUT /gateways/:id` para alterar `sshHostKeyFingerprint`: a API responde
`403 E_GATEWAY_SSH_HOST_KEY_ROTATION_REQUIRED`, para impedir troca sem auditoria.

### `POST /gateways/:id/ssh-host-key/rotate`

```json
{
  "sshHostKeyFingerprint": "SHA256:novafingerprint...",
  "reason": "Substituição planejada do hardware"
}
```

A alteração e o evento de auditoria são gravados na mesma transação. A resposta
contém a chave anterior, nova, usuário, e-mail, motivo e data. Repetir a chave
atual retorna `409 E_GATEWAY_SSH_HOST_KEY_UNCHANGED`.

### `GET /gateways/:id/ssh-host-key/rotations?page=1&limit=20`

Lista as rotações da mais recente para a mais antiga, junto de `meta` para
paginação.

## Alertas de segurança

Quando uma operação recebe uma chave SSH diferente da fixada, ela falha sem retry
com `E_GATEWAY_SSH_HOST_KEY_MISMATCH`. O backend cria alerta persistente `open` e
o health da fila fica `degraded`.

### `GET /gateways/:id/security-alerts?page=1&limit=20`

Lista alertas e seus campos `operationId`, `type`, `status`, `message` e horários.
Alertas reconhecidos também contêm `acknowledgedByUserId`,
`acknowledgedByEmail` e `acknowledgedAt`.

### `POST /gateways/:gatewayId/security-alerts/:alertId/acknowledge`

Não exige corpo. Registra quem reconheceu o alerta e quando. Um segundo
reconhecimento retorna `409 E_GATEWAY_SECURITY_ALERT_ALREADY_ACKNOWLEDGED`.

Reconhecer confirma que o evento foi investigado; não troca a fingerprint. Se a
chave do equipamento mudou legitimamente, use a rota de rotação e informe motivo.
