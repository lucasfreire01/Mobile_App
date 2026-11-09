#!/usr/bin/env bash
# Prepare the server only; starting it and changing firewall rules are separate steps.
set -euo pipefail
umask 077

if [[ $EUID -ne 0 || $# -lt 2 || $# -gt 3 ]]; then
  echo 'Usage: sudo bash install_ec2_openvpn.sh PUBLIC_HOST API_SYSTEM_USER [--resume]' >&2
  exit 1
fi
endpoint=$1
api_user=$2
resume=${3:-}
[[ -z "$resume" || "$resume" == --resume ]]
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ "$endpoint" =~ ^[A-Za-z0-9][A-Za-z0-9.-]{0,252}$ ]]
[[ "$api_user" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]
[[ "$api_user" != root ]]
id "$api_user" >/dev/null
for dependency in /usr/sbin/openvpn /usr/share/easy-rsa/easyrsa /usr/sbin/visudo /usr/bin/python3 /usr/bin/sudo; do
  [[ -x "$dependency" ]] || { echo "Missing dependency: $dependency" >&2; exit 1; }
done
[[ -f "$script_dir/ec2_openvpn_provisioner.py" ]]
state=/var/lib/saganexus-openvpn
server=/etc/openvpn/server/saganexus
config=/etc/saganexus/openvpn.json
# Never overwrite an existing PKI, server configuration or sudo policy.
for target in "$config" /etc/openvpn/server/saganexus.conf /etc/sudoers.d/saganexus-openvpn /usr/local/bin/saganexus-openvpn /usr/local/libexec/saganexus-openvpn-provisioner.py; do
  if [[ -e "$target" || -L "$target" ]]; then
    echo "Refusing to replace existing installation: $target" >&2
    exit 1
  fi
done
if [[ "$resume" == --resume ]]; then
  for directory in "$state" "$state/pki" "$server"; do
    [[ -d "$directory" && ! -L "$directory" && $(stat -c %u "$directory") == 0 ]]
  done
  [[ -f "$state/pki/ca.crt" && -f "$state/pki/private/ca.key" ]]
  [[ -z $(find "$state" -maxdepth 1 -name 'snx_*.json' -print -quit) ]]
  /usr/bin/openssl x509 -in "$state/pki/ca.crt" -checkend 86400 -noout >/dev/null
else
  [[ ! -e "$state" && ! -L "$state" && ! -e "$server" && ! -L "$server" ]]
fi
install -d -m 0700 -o root -g root "$state" /etc/saganexus
install -d -m 0755 -o root -g root "$server" "$server/ccd" /usr/local/libexec

export EASYRSA_BATCH=1
export EASYRSA_PKI="$state/pki"
export EASYRSA_CRL_DAYS=180
provision_log=$(mktemp "$state/install.XXXXXX")
trap 'rm -f -- "$provision_log"' EXIT
if ! (
  cd "$state" &&
  if [[ "$resume" != --resume ]]; then
    /usr/share/easy-rsa/easyrsa init-pki &&
    EASYRSA_REQ_CN=SagaNexus-Test-CA /usr/share/easy-rsa/easyrsa build-ca nopass || exit 1
  fi &&
  if [[ ! -f "$state/pki/issued/saganexus-server.crt" ]]; then
    env -u EASYRSA_REQ_CN /usr/share/easy-rsa/easyrsa build-server-full saganexus-server nopass || exit 1
  fi &&
  /usr/share/easy-rsa/easyrsa gen-crl
) >"$provision_log" 2>&1; then
  echo 'PKI setup failed. Partial installation preserved; do not delete or retry blindly.' >&2
  exit 1
fi
install -m 0644 "$state/pki/ca.crt" "$server/ca.crt"
install -m 0644 "$state/pki/issued/saganexus-server.crt" "$server/server.crt"
install -m 0600 "$state/pki/private/saganexus-server.key" "$server/server.key"
install -m 0644 "$state/pki/crl.pem" "$server/crl.pem"
/usr/sbin/openvpn --genkey secret "$server/tls-crypt.key"
chmod 0600 "$server/tls-crypt.key"

/usr/bin/python3 -I - "$endpoint" "$config" <<'PY'
import json
import os
import sys
with open(sys.argv[2], 'x') as stream:
    os.chmod(sys.argv[2], 0o600)
    json.dump({'endpoint': sys.argv[1], 'port': 1194,
               'network': '10.200.0.0/24', 'server_ip': '10.200.0.1',
               'interface': 'tun-saganexus', 'allowed_routes': []}, stream)
PY

cat > /etc/openvpn/server/saganexus.conf <<'EOF'
port 1194
proto udp
dev tun-saganexus
dev-type tun
topology subnet
server 10.200.0.0 255.255.255.0 nopool
ca /etc/openvpn/server/saganexus/ca.crt
cert /etc/openvpn/server/saganexus/server.crt
key /etc/openvpn/server/saganexus/server.key
dh none
tls-version-min 1.2
tls-crypt /etc/openvpn/server/saganexus/tls-crypt.key
remote-cert-tls client
verify-client-cert require
crl-verify /etc/openvpn/server/saganexus/crl.pem
client-config-dir /etc/openvpn/server/saganexus/ccd
ccd-exclusive
management /run/openvpn-server/saganexus.sock unix
management-client-user root
keepalive 10 60
persist-key
persist-tun
user nobody
group nogroup
max-clients 100
verb 3
EOF
chmod 0600 /etc/openvpn/server/saganexus.conf
install -m 0755 -o root -g root "$script_dir/ec2_openvpn_provisioner.py" /usr/local/libexec/saganexus-openvpn-provisioner.py
cat > /usr/local/bin/saganexus-openvpn <<'EOF'
#!/bin/sh
set -eu
[ "$#" -eq 0 ] || exit 1
exec /usr/bin/sudo -n /usr/bin/python3 -I /usr/local/libexec/saganexus-openvpn-provisioner.py
EOF
chmod 0755 /usr/local/bin/saganexus-openvpn
sudo_policy=$(mktemp "$state/sudoers.XXXXXX")
printf '%s ALL=(root) NOPASSWD: /usr/bin/python3 -I /usr/local/libexec/saganexus-openvpn-provisioner.py\n' "$api_user" > "$sudo_policy"
if ! /usr/sbin/visudo -cf "$sudo_policy" >/dev/null; then
  rm -f -- "$sudo_policy"
  echo 'Sudo policy validation failed; service remains stopped.' >&2
  exit 1
fi
install -m 0440 -o root -g root "$sudo_policy" /etc/sudoers.d/saganexus-openvpn
rm -f -- "$sudo_policy"
cat > /etc/systemd/system/saganexus-openvpn-crl.service <<'EOF'
[Unit]
Description=Renew SagaNexus OpenVPN certificate revocation list
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I /usr/local/libexec/saganexus-openvpn-provisioner.py --renew-crl
EOF
cat > /etc/systemd/system/saganexus-openvpn-crl.timer <<'EOF'
[Unit]
Description=Weekly SagaNexus OpenVPN CRL renewal
[Timer]
OnCalendar=weekly
Persistent=true
[Install]
WantedBy=timers.target
EOF
echo 'OpenVPN files and restricted helper installed. No service was started.'
echo 'UDP 1194, the CRL renewal timer and a real connection still require activation/validation.'
echo 'Do not set VPN_PROVIDER=ec2_openvpn until the server has been checked.'
