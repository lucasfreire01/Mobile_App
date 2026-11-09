#!/bin/sh
set -eu

PATH=/usr/sbin:/usr/bin:/sbin:/bin
if [ "$(id -u)" -ne 0 ]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 https://backend.example.com" >&2
  exit 1
fi
API_URL=${1%/}
case "$API_URL" in https://*) ;; *) echo 'API URL must use HTTPS.' >&2; exit 1 ;; esac
case "$API_URL" in *[!A-Za-z0-9._:/-]*) echo 'API URL contains unsupported characters.' >&2; exit 1 ;; esac

CA_BUNDLE=/etc/saganexus/ca-bundle.pem
[ -s "$CA_BUNDLE" ] || { echo 'Install the verified SagaNexus CA bundle first.' >&2; exit 1; }

printf 'Enrollment code: '
OLD_STTY=$(stty -g </dev/tty)
restore_terminal() {
  [ -z "${OLD_STTY:-}" ] || stty "$OLD_STTY" </dev/tty
}
trap restore_terminal EXIT HUP INT TERM
stty -echo </dev/tty
IFS= read -r ENROLLMENT_CODE </dev/tty
stty "$OLD_STTY" </dev/tty
OLD_STTY=
printf '\n'
case "$ENROLLMENT_CODE" in *[!A-Za-z0-9_-]*|'') echo 'Invalid enrollment code.' >&2; exit 1 ;; esac
[ "${#ENROLLMENT_CODE}" -eq 43 ] || { echo 'Invalid enrollment code.' >&2; exit 1; }

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AGENT_SOURCE="$SCRIPT_DIR/gateway_enrollment_agent.sh"
[ -f "$AGENT_SOURCE" ] || { echo 'Enrollment agent script is missing.' >&2; exit 1; }
which curl >/dev/null 2>&1 || { echo 'curl is required.' >&2; exit 1; }
which jq >/dev/null 2>&1 || { echo 'jq is required.' >&2; exit 1; }
busybox --list | grep -q '^base64$' || { echo 'BusyBox base64 is required.' >&2; exit 1; }

mkdir -p /etc/saganexus
chmod 700 /etc/saganexus
cp "$AGENT_SOURCE" /usr/sbin/saganexus-enrollment-agent
chmod 700 /usr/sbin/saganexus-enrollment-agent
umask 077
printf "API_URL='%s'\nENROLLMENT_CODE='%s'\nCA_BUNDLE='%s'\n" "$API_URL" "$ENROLLMENT_CODE" "$CA_BUNDLE" \
  > /etc/saganexus/enrollment.conf
mkdir -p /etc/crontabs
CRON_LINE='* * * * * /usr/sbin/saganexus-enrollment-agent'
if ! grep -Fq "$CRON_LINE" /etc/crontabs/root 2>/dev/null; then
  echo "$CRON_LINE" >> /etc/crontabs/root
fi
unset ENROLLMENT_CODE
/usr/sbin/saganexus-enrollment-agent || true
