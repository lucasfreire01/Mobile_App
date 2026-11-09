#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

[ "$(id -u)" -eq 0 ] || { echo 'Root is required.' >&2; exit 1; }
SOURCE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
for tool in curl jq busybox ssh-keygen awk grep mktemp; do
  which "$tool" >/dev/null 2>&1 || { echo "Missing dependency: $tool" >&2; exit 1; }
done
busybox --list | grep -q '^base64$' || exit 1
for file in gateway_enrollment_agent.sh enrollment.conf ca-bundle.pem; do
  [ -s "$SOURCE/$file" ] || { echo 'Package is incomplete.' >&2; exit 1; }
done
[ -s /etc/ssh/ssh_host_ed25519_key.pub ] || exit 1
sh -n "$SOURCE/gateway_enrollment_agent.sh"
mkdir -p /etc/saganexus /etc/crontabs
chmod 700 /etc/saganexus
LOCK=/etc/saganexus/.package-install.lock
mkdir "$LOCK" 2>/dev/null || { echo 'Another package installation is active.' >&2; exit 1; }
BACKUP=$(mktemp -d /etc/saganexus/.package-backup.XXXXXX) || { rm -r "$LOCK"; exit 1; }
INSTALLED=0
BACKUP_READY=0
cleanup() {
  restored=1
  if [ "$INSTALLED" -ne 1 ] && [ "$BACKUP_READY" -eq 1 ]; then
    for name in agent config ca cron; do
      case "$name" in
        agent) target=/usr/sbin/saganexus-enrollment-agent ;;
        config) target=/etc/saganexus/enrollment.conf ;;
        ca) target=/etc/saganexus/ca-bundle.pem ;;
        cron) target=/etc/crontabs/root ;;
      esac
      if [ -f "$BACKUP/$name" ]; then
        if ! cp -p "$BACKUP/$name" "$target"; then restored=0; continue; fi
      else
        rm -f "$target" || restored=0
      fi
      rm -f "$target.package-pending"
    done
  fi
  if [ "$restored" -eq 1 ]; then
    rm -rf "$BACKUP"
  else
    echo 'Rollback incomplete; private recovery backup retained.' >&2
  fi
  rm -r "$LOCK" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
for name in agent config ca cron; do
  case "$name" in
    agent) target=/usr/sbin/saganexus-enrollment-agent ;;
    config) target=/etc/saganexus/enrollment.conf ;;
    ca) target=/etc/saganexus/ca-bundle.pem ;;
    cron) target=/etc/crontabs/root ;;
  esac
  if [ -e "$target" ]; then cp -p "$target" "$BACKUP/$name"; fi
done
BACKUP_READY=1
cp "$SOURCE/ca-bundle.pem" /etc/saganexus/ca-bundle.pem.package-pending
cp "$SOURCE/enrollment.conf" /etc/saganexus/enrollment.conf.package-pending
cp "$SOURCE/gateway_enrollment_agent.sh" /usr/sbin/saganexus-enrollment-agent.package-pending
chmod 600 /etc/saganexus/ca-bundle.pem.package-pending /etc/saganexus/enrollment.conf.package-pending
chmod 700 /usr/sbin/saganexus-enrollment-agent.package-pending
mv /etc/saganexus/ca-bundle.pem.package-pending /etc/saganexus/ca-bundle.pem
mv /etc/saganexus/enrollment.conf.package-pending /etc/saganexus/enrollment.conf
mv /usr/sbin/saganexus-enrollment-agent.package-pending /usr/sbin/saganexus-enrollment-agent
if [ -f /etc/crontabs/root ]; then
  cp -p /etc/crontabs/root /etc/crontabs/root.package-pending
else
  : > /etc/crontabs/root.package-pending
fi
CRON_LINE='* * * * * /usr/sbin/saganexus-enrollment-agent'
if ! grep -Fqx "$CRON_LINE" /etc/crontabs/root.package-pending; then
  printf '\n%s\n' "$CRON_LINE" >> /etc/crontabs/root.package-pending
fi
chmod 600 /etc/crontabs/root.package-pending
mv /etc/crontabs/root.package-pending /etc/crontabs/root
INSTALLED=1
rm -f "$SOURCE/enrollment.conf"
if /usr/sbin/saganexus-enrollment-agent && [ ! -s /etc/saganexus/enrollment.conf ]; then
  echo 'SagaNexus agent installed; enrollment completed.'
else
  echo 'SagaNexus agent installed; enrollment pending. Automatic retry every minute.'
fi
