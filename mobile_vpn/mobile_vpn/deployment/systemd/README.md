# Serviços systemd

Estes arquivos executam a API e o worker de rede como processos separados.
O PostgreSQL continua sendo a única fila: não há Redis nem outro broker.

## Premissas

- O build de produção está em `/opt/mobile_vpn/build`.
- Existe um usuário de sistema sem privilégios chamado `browan`.
- As variáveis de produção ficam em `/etc/browan/mobile-vpn.env` e não são versionadas.
- O Node.js está em `/usr/bin/node`. Ajuste o caminho se necessário.

## Build e migrações

No diretório do projeto:

```bash
npm ci
node ace build
cd build
npm ci --omit=dev
node scripts/with-db-admin.mjs migration:run --force
```

Copie o conteúdo gerado de `build/` para `/opt/mobile_vpn/build` com posse do usuário `browan`.

Antes das migrações, disponibilize ao processo de deploy as variáveis da aplicação
e `DB_ADMIN_ENV_FILE` apontando para o arquivo administrativo privado. Depois das
migrações, reconcilie as permissões com `node scripts/provision-database-runtime.mjs prepare`
no ambiente de administração. Veja [papéis do banco](../../docs/database-runtime-role.md).
O usuário `browan` da API/worker não deve ter acesso ao arquivo administrativo.

## Arquivo de ambiente

Crie o arquivo fora do projeto e restrinja a leitura:

```bash
sudo install -d -m 750 -o browan -g browan /etc/browan
sudo install -m 600 -o browan -g browan /dev/null /etc/browan/mobile-vpn.env
sudoedit /etc/browan/mobile-vpn.env
```

Preencha nele as mesmas variáveis necessárias do `.env.example`, com valores de produção. Nunca copie esse arquivo para o repositório.

Use em `DB_USER`/`DB_PASSWORD` a credencial restrita de runtime, não o superusuário
de bootstrap/migrações. A credencial administrativa fica fora desse arquivo.

## Instalação e operação

```bash
sudo cp deployment/systemd/browan-api.service /etc/systemd/system/
sudo cp deployment/systemd/browan-gateway-network-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now browan-api browan-gateway-network-worker
```

Verifique os processos:

```bash
systemctl status browan-api browan-gateway-network-worker
journalctl -u browan-gateway-network-worker -f
```

Após uma atualização, faça novo build, substitua o diretório `build/` de forma atômica e reinicie ambos:

```bash
sudo systemctl restart browan-api browan-gateway-network-worker
```
