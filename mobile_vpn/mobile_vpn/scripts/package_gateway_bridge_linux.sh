#!/usr/bin/env bash
set -euo pipefail

version="24.22.2"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output="${1:-/tmp/saganexus-gateway-bridge-linux-x64.tar.gz}"
config="${2:-}"
umask 077
[ -n "$config" ] || { echo 'Forneça a configuração individual obtida pelo fluxo autenticado do app.' >&2; exit 1; }
for file in gateway_lan_bridge.ts bridge_pairing_relay.ts validate_bridge_installation.ts install_gateway_bridge_linux.sh; do
  [ -s "$root/scripts/$file" ] || { echo 'Fontes da ponte incompletas.' >&2; exit 1; }
done
for tool in curl tar sha256sum node; do command -v "$tool" >/dev/null || { echo "Ferramenta obrigatória ausente: $tool" >&2; exit 1; }; done
if [ "$config" != '-' ]; then
  node "$root/scripts/validate_bridge_installation.ts" "$config"
fi
work="$(mktemp -d)"
pending=''
stdin_config=''
cleanup() {
  result=$?
  trap - EXIT
  rm -rf -- "$work"
  if [ -n "$pending" ]; then rm -f -- "$pending"; fi
if [ -n "$stdin_config" ]; then rm -f -- "$stdin_config"; fi
  exit "$result"
}
trap cleanup EXIT
if [ "$config" = '-' ]; then
  stdin_config="$(mktemp)"
  chmod 0600 "$stdin_config"
  cat > "$stdin_config"
  config="$stdin_config"
fi
[ -s "$config" ] || { echo 'Forneça a configuração individual obtida pelo fluxo autenticado do app.' >&2; exit 1; }
archive="node-v${version}-linux-x64.tar.xz"
base="https://nodejs.org/dist/v${version}"

curl --fail --silent --show-error --location "$base/SHASUMS256.txt" -o "$work/SHASUMS256.txt"
curl --fail --silent --show-error --location "$base/$archive" -o "$work/$archive"
(cd "$work" && grep "  $archive\$" SHASUMS256.txt | sha256sum --check --status) || { echo 'SHA-256 do Node não confere com o manifesto oficial.' >&2; exit 1; }

mkdir -p "$work/package/bin"
tar -xJf "$work/$archive" -C "$work" "node-v${version}-linux-x64/bin/node"
install -m 0755 "$work/node-v${version}-linux-x64/bin/node" "$work/package/bin/node"
install -m 0644 "$root/scripts/gateway_lan_bridge.ts" "$work/package/gateway_lan_bridge.ts"
install -m 0644 "$root/scripts/bridge_pairing_relay.ts" "$work/package/bridge_pairing_relay.ts"
install -m 0644 "$root/scripts/validate_bridge_installation.ts" "$work/package/validate_bridge_installation.ts"
install -m 0600 "$config" "$work/package/bridge.json"
node "$work/package/validate_bridge_installation.ts" "$work/package/bridge.json"
install -m 0755 "$root/scripts/install_gateway_bridge_linux.sh" "$work/package/install.sh"
mkdir -p "$(dirname "$output")"
pending="$(mktemp "$(dirname "$output")/.saganexus-bridge.XXXXXX.tar.gz")"
tar -czf "$pending" -C "$work/package" .
chmod 0600 "$pending"
mv -f -- "$pending" "$output"
pending=''
echo "Pacote criado: $output"
