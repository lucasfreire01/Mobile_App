#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH

fail() { echo "$*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fail 'Run this installer as root.'
[ "$#" -eq 1 ] || fail "Usage: $0 https://backend.example.com"
API_URL=${1%/}
case "$API_URL" in https://*) ;; *) fail 'API URL must use HTTPS.' ;; esac
case "$API_URL" in *[!A-Za-z0-9._:/-]*) fail 'Invalid API URL.' ;; esac

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENT_SOURCE="$SCRIPT_DIR/gateway_enrollment_agent.sh"
CGI_SOURCE="$SCRIPT_DIR/browan_package/enroll.cgi"
for file in "$AGENT_SOURCE" "$CGI_SOURCE" /etc/saganexus/ca-bundle.pem; do
  [ -s "$file" ] || fail "Required file missing: $file"
done
for tool in curl jq ssh-keygen uci; do
  command -v "$tool" >/dev/null 2>&1 || fail "Required command missing: $tool"
done
busybox --list | grep -qx base64 || fail 'BusyBox base64 is required.'

printf 'Enrollment code (input hidden): ' >/dev/tty
stty -echo </dev/tty
IFS= read -r ENROLLMENT_CODE </dev/tty
stty echo </dev/tty
printf '\n' >/dev/tty
case "$ENROLLMENT_CODE" in ''|*[!A-Za-z0-9_-]*) fail 'Invalid enrollment code.' ;; esac
[ "${#ENROLLMENT_CODE}" -eq 43 ] || fail 'Enrollment code must contain 43 characters.'

umask 077
mkdir -p /etc/saganexus /etc/crontabs /www/cgi-bin
LOCK=/var/run/saganexus-first-install.lock
mkdir "$LOCK" 2>/dev/null || fail 'Another installation is running.'
BACKUP=$(mktemp -d /etc/saganexus/.first-install-backup.XXXXXX)
rollback() {
  for item in agent cgi config; do
    case "$item" in
      agent) target=/usr/sbin/saganexus-enrollment-agent ;;
      cgi) target=/www/cgi-bin/saganexus_enroll.cgi ;;
      config) target=/etc/saganexus/enrollment.conf ;;
    esac
    if [ -f "$BACKUP/$item" ]; then cp -p "$BACKUP/$item" "$target"; else rm -f "$target"; fi
  done
}
for pair in 'agent:/usr/sbin/saganexus-enrollment-agent' 'cgi:/www/cgi-bin/saganexus_enroll.cgi' 'config:/etc/saganexus/enrollment.conf'; do
  name=${pair%%:*}; path=${pair#*:}
  [ ! -e "$path" ] || cp -p "$path" "$BACKUP/$name"
done
TMP=/tmp/saganexus-first-install.$$
trap 'rm -f "$TMP" "$TMP.agent" "$TMP.cgi" "$TMP.config"; rmdir "$LOCK" 2>/dev/null || true' EXIT HUP INT TERM
printf "API_URL='%s'\nENROLLMENT_CODE='%s'\nCA_BUNDLE='/etc/saganexus/ca-bundle.pem'\n" "$API_URL" "$ENROLLMENT_CODE" > "$TMP.config"
cp "$AGENT_SOURCE" "$TMP.agent"
cp "$CGI_SOURCE" "$TMP.cgi"
chmod 600 "$TMP.config"
chmod 700 "$TMP.agent"
chmod 755 "$TMP.cgi"
mv "$TMP.config" /etc/saganexus/enrollment.conf
mv "$TMP.agent" /usr/sbin/saganexus-enrollment-agent
mv "$TMP.cgi" /www/cgi-bin/saganexus_enroll.cgi
CRON='* * * * * /usr/sbin/saganexus-enrollment-agent'
grep -Fqx "$CRON" /etc/crontabs/root 2>/dev/null || printf '\n%s\n' "$CRON" >> /etc/crontabs/root
chmod 600 /etc/crontabs/root
echo 'Enrollment agent and discovery CGI installed.'
