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
node ace.js migration:run --force
```

Copie o conteúdo gerado de `build/` para `/opt/mobile_vpn/build` com posse do usuário `browan`.

## Arquivo de ambiente

Crie o arquivo fora do projeto e restrinja a leitura:

```bash
sudo install -d -m 750 -o browan -g browan /etc/browan
sudo install -m 600 -o browan -g browan /dev/null /etc/browan/mobile-vpn.env
sudoedit /etc/browan/mobile-vpn.env
```

Preencha nele as mesmas variáveis necessárias do `.env.example`, com valores de produção. Nunca copie esse arquivo para o repositório.

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
