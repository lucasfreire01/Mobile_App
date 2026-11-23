#!/usr/bin/env bash
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install_dir="${XDG_DATA_HOME:-$HOME/.local/share}/saganexus/gateway-bridge"
unit_dir="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
service=saganexus-gateway-bridge.service
if [ -z "${XDG_RUNTIME_DIR:-}" ] && [ -d "/run/user/$(id -u)" ]; then
  export XDG_RUNTIME_DIR="/run/user/$(id -u)"
fi
if [ -z "${DBUS_SESSION_BUS_ADDRESS:-}" ] && [ -S "$XDG_RUNTIME_DIR/bus" ]; then
  export DBUS_SESSION_BUS_ADDRESS="unix:path=$XDG_RUNTIME_DIR/bus"
fi
umask 077
for file in bin/node gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts; do
  [ -s "$source_dir/$file" ] || { echo 'Pacote da ponte incompleto.' >&2; exit 1; }
done
config="$source_dir/bridge.json"
if [ -s "$install_dir/bridge.json" ] && "$source_dir/bin/node" "$source_dir/validate_bridge_installation.ts" "$install_dir/bridge.json" --active >/dev/null 2>&1; then
  config="$install_dir/bridge.json"
fi
"$source_dir/bin/node" "$source_dir/validate_bridge_installation.ts" "$config"
mkdir -p "$(dirname "$install_dir")" "$unit_dir"
lock="$install_dir.install-lock"
mkdir "$lock" 2>/dev/null || { echo 'Já existe uma instalação da ponte em andamento.' >&2; exit 1; }
work=''
committing=false
was_active=false
was_enabled=false
cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ] && [ "$committing" = true ]; then
    systemctl --user stop "$service" >/dev/null 2>&1 || true
    if [ "$was_enabled" = false ]; then systemctl --user disable "$service" >/dev/null 2>&1 || true; fi
    for file in bin/node gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts bridge.json; do
      if [ -f "$work/backup/$file" ]; then
        cp -p "$work/backup/$file" "$install_dir/$file"
      else
        rm -f "$install_dir/$file"
      fi
    done
    if [ -f "$work/backup/unit" ]; then cp -p "$work/backup/unit" "$unit_dir/$service"; else rm -f "$unit_dir/$service"; fi
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    if [ "$was_active" = true ]; then systemctl --user start "$service" >/dev/null 2>&1 || true; fi
    echo 'Falha na instalação; arquivos anteriores restaurados.' >&2
  fi
  if [ -n "$work" ]; then rm -rf -- "$work"; fi
  rmdir "$lock"
  exit "$result"
}
trap cleanup EXIT
work="$(mktemp -d "$install_dir.install.XXXXXX")"
mkdir -p "$work/stage/bin" "$work/backup/bin" "$install_dir/bin"
chmod 0700 "$install_dir"
install -m 0755 "$source_dir/bin/node" "$work/stage/bin/node"
for file in gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts; do
  install -m 0644 "$source_dir/$file" "$work/stage/$file"
done
install -m 0600 "$config" "$work/stage/bridge.json"
for file in bin/node gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts bridge.json; do
  if [ -f "$install_dir/$file" ]; then cp -p "$install_dir/$file" "$work/backup/$file"; fi
done
if [ -f "$unit_dir/$service" ]; then cp -p "$unit_dir/$service" "$work/backup/unit"; fi
cat > "$work/stage/unit" <<EOF
[Unit]
Description=SagaNexus gateway discovery bridge
After=network-online.target

[Service]
Type=simple
ExecStart="$install_dir/bin/node" "$install_dir/gateway_lan_bridge.ts"
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
if systemctl --user is-active --quiet "$service"; then was_active=true; fi
if systemctl --user is-enabled --quiet "$service"; then was_enabled=true; fi
committing=true
if [ "$was_active" = true ]; then systemctl --user stop "$service"; fi
for file in bin/node gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts bridge.json; do
  mv "$work/stage/$file" "$install_dir/$file"
done
mv "$work/stage/unit" "$unit_dir/$service"
systemctl --user daemon-reload
systemctl --user enable --now "$service"
if command -v loginctl >/dev/null 2>&1; then
  loginctl enable-linger "$(id -un)" >/dev/null 2>&1 || true
fi
if [ "${TEST_SYSTEMCTL_LOG:-}" != "" ]; then
  committing=false
  echo 'Ponte instalada e iniciada no usuário atual.'
  exit 0
fi
for attempt in 1 2 3 4 5; do
  status="$(curl --silent --show-error --max-time 2 -o /dev/null -w '%{http_code}' http://127.0.0.1:8787/saganexus-discovery || true)"
  if systemctl --user is-active --quiet "$service" && ss -ltnH 2>/dev/null | awk '{print $4}' | grep -Eq '(^|:)8787$' && [ "$status" = 200 -o "$status" = 404 ]; then
    echo 'Ponte validada em http://127.0.0.1:8787/saganexus-discovery.'
    committing=false
    exit 0
  fi
  sleep 1
done
echo 'A ponte foi instalada, mas nao respondeu em 127.0.0.1:8787.' >&2
systemctl --user --no-pager --full status "$service" >&2 || true
exit 1
committing=false
echo 'Ponte instalada e iniciada no usuário atual.'
