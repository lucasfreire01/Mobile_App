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
SSH_OPTS="-o StrictHostKeyChecking=yes -o BatchMode=yes -o ConnectTimeout=10"
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

# Select the underlay family, independently of the VPN management address.
# auto uses usable default routes outside tun/tap; unknown or dual keeps both.
# Explicit modes: BROWAN_VPN_IP_FAMILY=4|6|dual. Legacy opt-in remains supported.
detect_vpn_ip_family() {
  ssh_run 'v4=0; v6=0
for family in 4 6; do
  routes=$(ip -$family route show default) || exit 1
  if printf "%s\n" "$routes" | awk '\''$1 == "default" && $0 !~ /(^| )(unreachable|blackhole|prohibit|linkdown)( |$)/ { for (i=1;i<NF;i++) if ($i=="dev" && $(i+1) !~ /^(tun|tap|lo)/) found=1 } END { exit !found }'\''; then
    case "$family" in 4) v4=1;; 6) v6=1;; esac
  fi
done
case "$v4$v6" in 10) echo 4;; 01) echo 6;; *) echo dual;; esac'
}
rewrite_vpn_ip_family() {
  local family="$1"
  awk -v family="$family" '
    function transport(p) {
      if (p ~ /^udp[46]?$/) return "udp" (family == "dual" ? "" : family)
      if (p ~ /^tcp[46]?(-client)?$/) {
        suffix = p ~ /-client$/ ? "-client" : ""
        return "tcp" (family == "dual" ? "" : family) suffix
      }
      return p
    }
    $1 == "remote" && NF >= 4 { $4 = transport($4) }
    $1 == "proto" && NF >= 2 { $2 = transport($2) }
    { print }
  '
}
select_vpn_ip_family() {
  local mode="${BROWAN_VPN_IP_FAMILY:-auto}"
  if [[ -z "${BROWAN_VPN_IP_FAMILY:-}" && "${BROWAN_VPN_IPV4_ONLY:-0}" == 1 ]]; then
    mode=4
  fi
  case "$mode" in
    auto) detect_vpn_ip_family;;
    4|6|dual) printf '%s\n' "$mode";;
    *) echo "Invalid BROWAN_VPN_IP_FAMILY: expected auto, 4, 6 or dual" >&2; return 1;;
  esac
}
VPN_IP_FAMILY=$(select_vpn_ip_family)
OVPN=$(printf '%s\n' "$OVPN" | rewrite_vpn_ip_family "$VPN_IP_FAMILY")
echo "VPN transport IP family: $VPN_IP_FAMILY"

# Keep recovery state on the device; a failed local run restores it over LAN.
[[ "$MGMT_IP" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo "Invalid management IP" >&2; exit 1; }
[[ "$OVPN" == *'<cert>'* && "$OVPN" == *'<key>'* ]] || { echo "Invalid VPN profile" >&2; exit 1; }
RECOVERY_DIR="/etc/openvpn/.provision-recovery"
TRANSACTION_STARTED=0
finish_provisioning() {
  local result=$?
  trap - EXIT
  if [[ "$TRANSACTION_STARTED" == 1 ]]; then
    if [[ "$result" == 0 ]]; then
      # Require actual VPN reachability, not merely an existing tun interface.
      if ! ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${MGMT_IP}" true; then
        echo "VPN management SSH verification failed" >&2
        result=1
      fi
    fi
    if [[ "$result" != 0 ]]; then
      if ! ssh_run 'for f in /etc/openvpn/client.conf /etc/init.d/S92mgmtip /etc/crontabs/root /etc/config/vpn; do name=$(echo "$f" | tr / _); if test -f /etc/openvpn/.provision-recovery/$name; then cp -p /etc/openvpn/.provision-recovery/$name "$f" || exit 1; elif test -f /etc/openvpn/.provision-recovery/$name.absent; then rm -f "$f" || exit 1; fi; done; /etc/init.d/S90openvpn restart'; then
        echo "ROLLBACK FAILED: recovery files preserved in $RECOVERY_DIR; use LAN access" >&2
        exit 1
      fi
      echo "Provisioning failed; previous files restored and OpenVPN restarted" >&2
    fi
    if ! ssh_run 'rm -rf /etc/openvpn/.provision-recovery'; then
      echo "Recovery cleanup failed; inspect device before retrying" >&2
      exit 1
    fi
  fi
  exit "$result"
}
# mkdir is also a lock: never overwrite recovery data from another run.
ssh_run 'umask 077; mkdir /etc/openvpn/.provision-recovery' || exit 1
TRANSACTION_STARTED=1
trap finish_provisioning EXIT
ssh_run 'for f in /etc/openvpn/client.conf /etc/init.d/S92mgmtip /etc/crontabs/root /etc/config/vpn; do name=$(echo "$f" | tr / _); if test -f "$f"; then cp -p "$f" /etc/openvpn/.provision-recovery/$name || exit 1; else touch /etc/openvpn/.provision-recovery/$name.absent || exit 1; fi; done'
echo "$OVPN" | ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${GATEWAY_LOCAL_IP}" "umask 077; cat > /etc/openvpn/.client.conf.pending && mv /etc/openvpn/.client.conf.pending /etc/openvpn/client.conf"
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
    ip route replace 100.96.0.0/11 via 100.96.1.49 dev tun0 2>/dev/null || true
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
ssh_run "/etc/init.d/S90openvpn restart"

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

# Reapply tunnel routes after OpenVPN creates tun0.
ssh_run "/etc/init.d/S92mgmtip start"

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
