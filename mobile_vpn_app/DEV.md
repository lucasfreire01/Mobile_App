# Iniciar o ambiente local

Para subir PostgreSQL, API, worker de rede e frontend juntos, na raiz do repositório execute:

```bash
./mobile_vpn_app/dev.sh
```

Pré-requisitos: Docker com Compose, Node.js/npm e dependências instaladas na raiz do repositório e em `mobile_vpn_app/`. Configure o `.env` da raiz com base em `.env.example` antes da primeira execução. O script inicia o banco e espera ele ficar pronto; ele não executa migrations nem seeders.

O terminal informa os endereços do frontend e da API. A porta da API vem de `PORT` no `.env` da raiz; o frontend usa a primeira porta livre a partir de `8081`. Pressione Ctrl+C para encerrar API, worker e frontend. O PostgreSQL continua ligado e preserva os dados; para pará-lo manualmente, execute `docker compose down` na raiz.

Para abrir o app no celular pela rede local, use o IP da máquina acessível pelo telefone:

```bash
EXPO_PUBLIC_API_URL=http://<IP-DA-MAQUINA>:<PORTA-DA-API>/api/v1 ./mobile_vpn_app/dev.sh
```

Se o backend estiver em outra porta, ajuste `PORT` no `.env` da raiz e o endereço em `EXPO_PUBLIC_API_URL`.
