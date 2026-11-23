#!/usr/bin/env bash
set -euo pipefail
umask 077
command -v curl >/dev/null || { echo 'curl é obrigatório.' >&2; exit 1; }
command -v tar >/dev/null || { echo 'tar é obrigatório.' >&2; exit 1; }
command -v gzip >/dev/null || { echo 'gzip é obrigatório.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 é obrigatório.' >&2; exit 1; }
work="$(mktemp -d "${TMPDIR:-/tmp}/saganexus-bridge-bootstrap.XXXXXX")"
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
credential="$work/credential.json"; request="$work/request.json"; archive="$work/package.tar.gz"
mkdir "$work/package"; cat > "$credential"
api_url="${BACKEND_URL:-}"
python3 - "$credential" "$request" "$api_url" <<'PY'
import json, re, sys
from urllib.parse import urlsplit
source, target, api = sys.argv[1:]
with open(source, encoding='utf-8') as handle: value = json.load(handle)
if not isinstance(value, dict): raise SystemExit('Credencial inválida.')
bridge, token = value.get('bridgeId'), value.get('installationToken')
parts = urlsplit(api)
if not parts or parts.scheme != 'https' or parts.query or parts.fragment or parts.username or parts.password:
    raise SystemExit('URL HTTPS inválida.')
if not isinstance(bridge, str) or not re.fullmatch(r'[0-9a-fA-F-]{36}', bridge): raise SystemExit('bridgeId inválido.')
if not isinstance(token, str) or not re.fullmatch(r'[A-Za-z0-9_-]{43}', token): raise SystemExit('installationToken inválido.')
with open(target, 'w', encoding='utf-8') as handle: json.dump({'bridgeId': bridge, 'installationToken': token, 'platform': 'linux-x64'}, handle)
PY
api_url="${api_url%/}"
curl --fail --silent --show-error --location --retry 3 --retry-all-errors --connect-timeout 10 --proto '=https' --tlsv1.2 -H 'Content-Type: application/json' --data-binary "@$request" -o "$archive" "$api_url/api/v1/gateway-bridges/package"
gzip -t "$archive" || { echo 'Pacote da ponte chegou truncado ou corrompido.' >&2; exit 1; }
tar -xzf "$archive" -C "$work/package"
[ -s "$work/package/install.sh" ] || { echo 'Pacote recebido sem install.sh.' >&2; exit 1; }
chmod 0755 "$work/package/install.sh"
exec "$work/package/install.sh"
