#!/usr/bin/env bash
# =============================================================================
# provision_gateway.sh — Configures a Browan Pico Next gateway for the VPN
#
# Usage:
#   ./scripts/provision_gateway.sh <local-ip> <gateway-id> <backend-url> <token>
#
# Example:
#   ./scripts/provision_gateway.sh 192.168.11.20 3 http://localhost:3333 "oat_..."
#
# What it does:
#   1. Downloads the .ovpn profile from the backend
#   2. Installs it on the gateway at /etc/openvpn/client.conf
#   3. Enables VPN via uci (vpn.client.vpn_enable=1)
#   4. Creates /etc/init.d/S92mgmtip with the management IP
#   5. Adds the S92mgmtip crontab entry (if not already present)
#   6. Restarts OpenVPN
#   7. Verifies tun0 comes up with an IP
# =============================================================================
set -euo pipefail

# ── Arguments ─────────────────────────────────────────────────────────────────
GATEWAY_LOCAL_IP="${1:-}"
GATEWAY_ID="${2:-}"
BACKEND_URL="${3:-}"
TOKEN="${4:-}"

if [[ -z "$GATEWAY_LOCAL_IP" || -z "$GATEWAY_ID" || -z "$BACKEND_URL" || -z "$TOKEN" ]]; then
  echo "Usage: $0 <local-ip> <gateway-id> <backend-url> <token>"
  echo "  local-ip    Gateway LAN IP on your current network (e.g. 192.168.11.20)"
  echo "  gateway-id  ID returned by POST /api/v1/gateways (e.g. 3)"
  echo "  backend-url Backend base URL (e.g. http://localhost:3333)"
  echo "  token       Bearer token from POST /api/v1/auth/login"
  exit 1
fi

# ── SSH settings (reads .env if available) ────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

SSH_USER="${BROWAN_SSH_USERNAME:-root}"
SSH_PORT="${BROWAN_SSH_PORT:-22}"
SSH_KEY="${BROWAN_SSH_KEY_PATH:-}"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
[[ -n "$SSH_KEY" ]] && SSH_OPTS="$SSH_OPTS -i $SSH_KEY"

ssh_run() { ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${GATEWAY_LOCAL_IP}" "$@"; }

echo "▶ Fetching gateway info from backend (id=$GATEWAY_ID)..."
GW_JSON=$(curl -sf "$BACKEND_URL/api/v1/gateways/$GATEWAY_ID" \
  -H "Authorization: Bearer $TOKEN")
MGMT_IP=$(echo "$GW_JSON" | grep -o '"managementIpAddress":"[^"]*"' | cut -d'"' -f4)

if [[ -z "$MGMT_IP" ]]; then
  echo "✗ Could not read managementIpAddress from backend. Check gateway ID and token."
  exit 1
fi
echo "  Management IP: $MGMT_IP"

# ── 1. Download .ovpn and push to gateway ─────────────────────────────────────
echo "▶ Downloading .ovpn profile..."
OVPN=$(curl -sf "$BACKEND_URL/api/v1/gateways/$GATEWAY_ID/vpn-profile" \
  -H "Authorization: Bearer $TOKEN")

echo "▶ Installing /etc/openvpn/client.conf on gateway..."
echo "$OVPN" | ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${GATEWAY_LOCAL_IP}" "cat > /etc/openvpn/client.conf"
echo "  Done."

# ── 2. Enable VPN via uci ─────────────────────────────────────────────────────
echo "▶ Enabling VPN via uci..."
ssh_run "uci set vpn.client.vpn_enable='1'; uci commit vpn"

# ── 3. Install S92mgmtip ──────────────────────────────────────────────────────
echo "▶ Installing /etc/init.d/S92mgmtip (IP: ${MGMT_IP}/32)..."
MGMT_SCRIPT="#!/bin/sh
MGMT_IP=\"${MGMT_IP}/32\"
case \"\$1\" in
  start|restart|\"\")
    ip addr show dev lo | grep -q \"\${MGMT_IP%/*}\" || ip addr add \"\$MGMT_IP\" dev lo
    ;;
  stop)
    ip addr del \"\$MGMT_IP\" dev lo 2>/dev/null
    ;;
esac
exit 0"
echo "$MGMT_SCRIPT" | ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${GATEWAY_LOCAL_IP}" "cat > /etc/init.d/S92mgmtip && chmod +x /etc/init.d/S92mgmtip"

# ── 4. Add crontab entry ──────────────────────────────────────────────────────
echo "▶ Adding S92mgmtip crontab entry..."
ssh_run "grep -q 'S92mgmtip' /etc/crontabs/root 2>/dev/null \
  || echo '* * * * * /etc/init.d/S92mgmtip start' >> /etc/crontabs/root"

# ── 5. Apply management IP immediately ────────────────────────────────────────
echo "▶ Applying management IP now..."
ssh_run "/etc/init.d/S92mgmtip start"

# ── 6. Restart OpenVPN ────────────────────────────────────────────────────────
echo "▶ Restarting OpenVPN..."
ssh_run "/etc/init.d/S90openvpn restart" || true

# ── 7. Wait for tun0 ──────────────────────────────────────────────────────────
echo "▶ Waiting for VPN tunnel (tun0)..."
TUN_IP=""
for i in $(seq 1 18); do
  TUN_IP=$(ssh_run "/sbin/ifconfig tun0 2>/dev/null | grep 'inet addr' | sed 's/.*inet addr://;s/ .*//'") || true
  if [[ -n "$TUN_IP" ]]; then
    echo "  ✓ tun0 up — VPN IP: $TUN_IP"
    break
  fi
  echo "  ($i/18) waiting 5s..."
  sleep 5
done

if [[ -z "$TUN_IP" ]]; then
  echo "  ⚠ tun0 did not come up within 90s."
  echo "    Check: ssh ${SSH_USER}@${GATEWAY_LOCAL_IP} 'cat /app/log/openvpn/openvpn.client.log'"
  exit 1
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════"
echo "✓ Gateway $GATEWAY_ID provisioned!"
echo "  Management IP : $MGMT_IP"
echo "  VPN IP (tun0) : $TUN_IP"
echo ""
echo "To verify:"
echo "  nc -zv -w5 $MGMT_IP 22"
echo "  curl $BACKEND_URL/api/v1/gateways/$GATEWAY_ID -H 'Authorization: Bearer <token>'"
echo "════════════════════════════════════════"
