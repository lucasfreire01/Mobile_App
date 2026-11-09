#!/bin/sh
set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
CONFIG=/etc/saganexus/enrollment.conf
AGENT=/usr/sbin/saganexus-enrollment-agent
LOCK=/var/run/saganexus-enrollment.lock

[ -r "$CONFIG" ] || exit 0
. "$CONFIG"
CA_BUNDLE=${CA_BUNDLE:-/etc/saganexus/ca-bundle.pem}
[ -s "$CA_BUNDLE" ] || exit 1
: "${API_URL:?missing API_URL}"
: "${ENROLLMENT_CODE:?missing ENROLLMENT_CODE}"

case "$API_URL" in https://*) ;; *) exit 1 ;; esac
case "$ENROLLMENT_CODE" in *[!A-Za-z0-9_-]*|'') exit 1 ;; esac
[ "${#ENROLLMENT_CODE}" -eq 43 ] || exit 1
which curl >/dev/null 2>&1 || exit 1
which jq >/dev/null 2>&1 || exit 1
busybox --list | grep -q '^base64$' || exit 1

mkdir -p /var/run /etc/saganexus
mkdir "$LOCK" 2>/dev/null || exit 0
WORK=$(mktemp -d /tmp/saganexus-enrollment.XXXXXX)
cleanup() {
  rm -rf "$WORK"
  rm -r "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM
umask 077

API_URL=${API_URL%/}
HOST_KEY=/etc/ssh/ssh_host_ed25519_key.pub
[ -s "$HOST_KEY" ] || exit 1
ssh_fingerprint=$(ssh-keygen -l -f "$HOST_KEY" -E sha256 | awk '{print $2}')
printf '%s\n' "$ssh_fingerprint" | grep -Eq '^SHA256:[A-Za-z0-9+/]{43}$' || exit 1
printf '{"code":"%s","sshHostKeyFingerprint":"%s"}' "$ENROLLMENT_CODE" "$ssh_fingerprint" > "$WORK/request.json"
if ! curl --cacert "$CA_BUNDLE" --fail --silent --show-error --max-time 30 \
  -H 'Content-Type: application/json' \
  --data-binary "@$WORK/request.json" \
  "$API_URL/api/v1/gateways/enrollment/claim" > "$WORK/response.json"; then
  exit 1
fi

gateway_id=$(jq -er '.gateway.id' "$WORK/response.json")
management_ip=$(jq -er '.gateway.managementIpAddress' "$WORK/response.json")
format=$(jq -er '.vpn.format' "$WORK/response.json")
profile_base64=$(jq -er '.vpn.contentBase64' "$WORK/response.json")
case "$gateway_id" in ''|*[!0-9]*) exit 1 ;; esac
case "$format" in openvpn) ;; *) exit 1 ;; esac
printf '%s\n' "$management_ip" | awk -F. '
  NF != 4 { exit 1 }
  { for (i = 1; i <= 4; i++) if ($i !~ /^[0-9]+$/ || $i > 255) exit 1 }
'
[ -n "$profile_base64" ] || exit 1
printf '%s' "$profile_base64" | busybox base64 -d > "$WORK/client.conf"
grep -q '<cert>' "$WORK/client.conf"
grep -q '<key>' "$WORK/client.conf"

OPENVPN_CONFIG=/etc/openvpn/client.conf
MGMT_SCRIPT=/etc/init.d/S92mgmtip
UCI_WAS_ENABLED=$(uci -q get vpn.client.vpn_enable || true)
if [ -f "$OPENVPN_CONFIG" ]; then cp -p "$OPENVPN_CONFIG" "$WORK/previous-client.conf"; fi
if [ -f "$MGMT_SCRIPT" ]; then cp -p "$MGMT_SCRIPT" "$WORK/previous-mgmtip"; fi

if [ -f "$OPENVPN_CONFIG" ] && [ "$(cat "$WORK/client.conf")" = "$(cat "$OPENVPN_CONFIG")" ] && ifconfig tun0 2>/dev/null | grep -q 'inet addr:'; then
  curl --cacert "$CA_BUNDLE" --fail --silent --show-error --max-time 15 \
    -H 'Content-Type: application/json' --data-binary "@$WORK/request.json" \
    "$API_URL/api/v1/gateways/enrollment/complete" >/dev/null
  rm -f "$CONFIG"
  exit 0
fi

cat > "$WORK/S92mgmtip" <<EOF
#!/bin/sh
MGMT_IP='$management_ip'
case "\${1:-start}" in
  start) /sbin/ip -4 address replace "\$MGMT_IP/32" dev lo ;;
  stop) /sbin/ip -4 address del "\$MGMT_IP/32" dev lo 2>/dev/null || true ;;
esac
exit 0
EOF
chmod 700 "$WORK/S92mgmtip"
mkdir -p /etc/openvpn
cp "$WORK/client.conf" "$OPENVPN_CONFIG.pending"
chmod 600 "$OPENVPN_CONFIG.pending"
mv "$OPENVPN_CONFIG.pending" "$OPENVPN_CONFIG"
cp "$WORK/S92mgmtip" "$MGMT_SCRIPT"
chmod 700 "$MGMT_SCRIPT"
if ! grep -Fq '/etc/init.d/S92mgmtip start' /etc/crontabs/root 2>/dev/null; then
  echo '* * * * * /etc/init.d/S92mgmtip start' >> /etc/crontabs/root
fi
uci set vpn.client.vpn_enable='1'
uci commit vpn
/etc/init.d/S92mgmtip start
connected=0
if /etc/init.d/S90openvpn restart; then
  attempt=0
  while [ "$attempt" -lt 18 ]; do
    if ifconfig tun0 2>/dev/null | grep -q 'inet addr:'; then
      connected=1
      break
    fi
    attempt=$((attempt + 1))
    sleep 5
  done
fi

if [ "$connected" -ne 1 ]; then
  if [ -f "$WORK/previous-client.conf" ]; then
    cp -p "$WORK/previous-client.conf" "$OPENVPN_CONFIG"
  else
    rm -f "$OPENVPN_CONFIG"
  fi
  if [ -f "$WORK/previous-mgmtip" ]; then
    cp -p "$WORK/previous-mgmtip" "$MGMT_SCRIPT"
  else
    rm -f "$MGMT_SCRIPT"
  fi
  if [ "$UCI_WAS_ENABLED" != 1 ]; then
    uci set vpn.client.vpn_enable='0'
    uci commit vpn
  fi
  /etc/init.d/S90openvpn restart || true
  exit 1
fi

curl --cacert "$CA_BUNDLE" --fail --silent --show-error --max-time 15 \
  -H 'Content-Type: application/json' --data-binary "@$WORK/request.json" \
  "$API_URL/api/v1/gateways/enrollment/complete" >/dev/null
rm -f "$CONFIG"
