# Ponte SagaNexus para Linux

O pacote Linux x64 inclui o runtime Node.js; o computador de produção não precisa ter Node instalado. Para montá-lo em uma máquina de desenvolvimento com internet:

```bash
bash scripts/package_gateway_bridge_linux.sh
```

O arquivo sai em `/tmp/saganexus-gateway-bridge-linux-x64.tar.gz`. Copie-o para o notebook de produção, extraia e instale como o usuário que fará o pareamento:

```bash
mkdir -p ~/saganexus-bridge && tar -xzf saganexus-gateway-bridge-linux-x64.tar.gz -C ~/saganexus-bridge
cd ~/saganexus-bridge && ./install.sh
```

O serviço de usuário inicia automaticamente após login. Ele detecta Wi-Fi e Ethernet pelos nomes das interfaces e publica os gateways encontrados. O celular e o Wi-Fi do notebook precisam estar na mesma rede local; o firewall do notebook deve permitir TCP 8787 e a faixa TCP 8800–8863 na rede privada. A ponte não altera rotas nem regras de firewall.

Comandos úteis:

```bash
systemctl --user status saganexus-gateway-bridge.service
journalctl --user -u saganexus-gateway-bridge.service -f
systemctl --user disable --now saganexus-gateway-bridge.service
```

Este pacote cobre Linux x64. Linux ARM64 fica para etapa própria; o instalador Windows está documentado em `gateway-bridge-windows.md`.
