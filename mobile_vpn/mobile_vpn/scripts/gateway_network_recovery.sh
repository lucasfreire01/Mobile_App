#!/bin/sh
# Renew DHCP after moving Ethernet to another network; static setups are untouched.
set -eu
[ "$(cat /sys/class/net/eth0/carrier 2>/dev/null || true)" = 1 ] || exit 0
pid=$(cat /var/run/udhcpc.eth0.pid 2>/dev/null || true)
case "$pid" in ''|*[!0-9]*) exit 0 ;; esac
[ -r "/proc/$pid/cmdline" ] || exit 0
command=$(tr '\000' ' ' < "/proc/$pid/cmdline")
case "$command" in *udhcpc*) kill -USR1 "$pid" ;; *) exit 0 ;; esac
