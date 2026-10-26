import { Exception } from '@adonisjs/core/exceptions'

export type StaticEthernetSettings = {
  ipAddress: string
  prefixLength: number
  gateway: string
  primaryDns?: string | null
  secondaryDns?: string | null
}

/** Static profile kept locally while DHCP remains the active WAN mode. */
export type DhcpFallbackSettings = StaticEthernetSettings

const DHCP_FALLBACK_SCRIPT_PATH = '/usr/sbin/gateway_dhcp_fallback.sh'
const DHCP_FALLBACK_CRON_LINE = '* * * * * /usr/sbin/gateway_dhcp_fallback.sh >/dev/null 2>&1'
const NETWORK_INTERFACES_PATH = '/etc/network/interfaces'
const STATIC_ROLLBACK_SCRIPT_PATH = '/usr/sbin/gateway_static_rollback.sh'
const STATIC_ROLLBACK_TOKEN_PATH = '/tmp/gateway_static_rollback.token'
const STATIC_ROLLBACK_PID_PATH = '/tmp/gateway_static_rollback.pid'
const STATIC_ROLLBACK_NETWORK_BACKUP_PATH = '/tmp/gateway_static_network.backup'
const STATIC_ROLLBACK_INTERFACES_BACKUP_PATH = '/tmp/gateway_static_interfaces.backup'
const STATIC_ROLLBACK_ADDRESSES_BACKUP_PATH = '/tmp/gateway_static_addresses.backup'

export const DHCP_FALLBACK_FAILURE_THRESHOLD = 3
export const DHCP_FALLBACK_COOLDOWN_SECONDS = 900
export const STATIC_ROLLBACK_TIMEOUT_SECONDS = 120

export const DHCP_FALLBACK_SCRIPT = [
  '#!/bin/sh',
  '',
  "CONFIG='gateway_fallback.wan'",
  "ETHERNET_INTERFACE='eth0'",
  "PID_FILE='/var/run/gateway_dhcp_fallback.pid'",
  "FAILURE_FILE='/tmp/gateway_dhcp_fallback_failures'",
  '',
  'cleanup() { rm -f "$PID_FILE"; }',
  '',
  'if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then exit 0; fi',
  'echo $$ > "$PID_FILE"',
  'trap cleanup EXIT INT TERM',
  '',
  'enabled="$(uci -q get "$CONFIG.enabled")"',
  '[ "$enabled" = "1" ] || { rm -f "$FAILURE_FILE"; exit 0; }',
  '',
  '# Once fallback changes WAN to static, only a new DHCP apply reenables supervision.',
  '[ "$(uci -q get network.wan.proto)" = "dhcp" ] || { rm -f "$FAILURE_FILE"; exit 0; }',
  '',
  'dhcp_address="$(ip -4 addr show dev "$ETHERNET_INTERFACE" 2>/dev/null | awk \'/inet / { split($2, parts, "/"); if (parts[1] != "168.168.168.253") { print parts[1]; exit } }\')"',
  'if [ -n "$dhcp_address" ]; then rm -f "$FAILURE_FILE"; exit 0; fi',
  '',
  'threshold="$(uci -q get "$CONFIG.failure_threshold")"',
  `case "$threshold" in ""|*[!0-9]*) threshold=${DHCP_FALLBACK_FAILURE_THRESHOLD} ;; esac`,
  `[ "$threshold" -gt 0 ] || threshold=${DHCP_FALLBACK_FAILURE_THRESHOLD}`,
  'failures=0',
  '[ -f "$FAILURE_FILE" ] && failures="$(cat "$FAILURE_FILE" 2>/dev/null)"',
  'case "$failures" in ""|*[!0-9]*) failures=0 ;; esac',
  'failures=$((failures + 1))',
  'echo "$failures" > "$FAILURE_FILE"',
  '',
  'if [ "$failures" -lt "$threshold" ]; then',
  '  logger -t gateway-dhcp-fallback "DHCP address missing ($failures/$threshold)"',
  '  exit 0',
  'fi',
  '',
  'now="$(date +%s)"',
  'cooldown="$(uci -q get "$CONFIG.cooldown_seconds")"',
  'last_switch="$(uci -q get "$CONFIG.last_switch_at")"',
  `case "$cooldown" in ""|*[!0-9]*) cooldown=${DHCP_FALLBACK_COOLDOWN_SECONDS} ;; esac`,
  'case "$last_switch" in ""|*[!0-9]*) last_switch=0 ;; esac',
  'if [ $((now - last_switch)) -lt "$cooldown" ]; then',
  '  logger -t gateway-dhcp-fallback "DHCP fallback is in cooldown"',
  '  exit 0',
  'fi',
  '',
  'ip_address="$(uci -q get "$CONFIG.ipaddr")"',
  'netmask="$(uci -q get "$CONFIG.netmask")"',
  'gateway="$(uci -q get "$CONFIG.gateway")"',
  'primary_dns="$(uci -q get "$CONFIG.primary_dns")"',
  'secondary_dns="$(uci -q get "$CONFIG.secondary_dns")"',
  'if [ -z "$ip_address" ] || [ -z "$netmask" ] || [ -z "$gateway" ] || [ -z "$primary_dns" ]; then',
  '  logger -t gateway-dhcp-fallback "Fallback profile is incomplete; refusing to change WAN"',
  '  exit 1',
  'fi',
  '',
  'for pid in $(ps w | awk \'/[u]dhcpc/ && /-i eth0/ { print $1 }\'); do kill "$pid" 2>/dev/null; done',
  'uci set network.wan.proto="static"',
  'uci set network.wan.ipaddr="$ip_address"',
  'uci set network.wan.netmask="$netmask"',
  'uci set network.wan.gateway="$gateway"',
  'uci -q delete network.wan.dns',
  'uci -q delete network.wan.dns_1',
  'uci -q delete network.wan.dns_2',
  'uci set network.wan.peerdns="0"',
  'uci set network.wan.dns_1="$primary_dns"',
  '[ -z "$secondary_dns" ] || uci set network.wan.dns_2="$secondary_dns"',
  '{',
  '  echo "# interfaces(5) file used by ifup(8) and ifdown(8)"',
  '  echo "auto lo"',
  '  echo "iface lo inet loopback"',
  '  echo "auto eth0"',
  '  echo "iface eth0 inet static"',
  '  echo "  address $ip_address"',
  '  echo "  netmask $netmask"',
  '  echo "  gateway $gateway"',
  '} > /etc/network/interfaces',
  'uci set "$CONFIG.last_switch_at=$now"',
  'uci commit network',
  'uci commit gateway_fallback',
  'rm -f "$FAILURE_FILE"',
  'logger -t gateway-dhcp-fallback "DHCP unavailable after $failures checks; static fallback $ip_address activated"',
  '( sleep 2; /etc/init.d/S40network restart ) >/dev/null 2>&1 &',
].join('\n')

const ETHERNET_DHCP_COMMAND = [
  "printf '%s\\n' '# interfaces(5) file used by ifup(8) and ifdown(8)' 'auto lo' 'iface lo inet loopback' 'auto eth0' 'iface eth0 inet dhcp' > /etc/network/interfaces",
  'uci set network.wan.proto=dhcp',
  '(uci -q delete network.wan.ipaddr >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.netmask >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.gateway >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.dns >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.dns_1 >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.dns_2 >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.peerdns >/dev/null 2>&1 || true)',
  'uci commit network',
  '{ (sleep 2; /etc/init.d/S40network restart) >/dev/null 2>&1 & :; }',
].join(' && ')

const DISABLE_DHCP_FALLBACK_COMMAND = [
  'uci set gateway_fallback.wan=dhcp_fallback',
  "uci set gateway_fallback.wan.enabled='0'",
  'uci commit gateway_fallback',
].join(' && ')

const quoteForShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const buildWriteFileCommand = (path: string, content: string) => {
  const lines = content.trimEnd().split('\n').map(quoteForShell).join(' ')
  return `printf '%s\\n' ${lines} > ${quoteForShell(path)}`
}

export const prefixLengthToNetmask = (prefixLength: number) => {
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) {
    throw new Exception('Invalid IPv4 prefix length.', {
      status: 422,
      code: 'E_GATEWAY_STATIC_PREFIX_INVALID',
    })
  }

  const mask = (0xffffffff << (32 - prefixLength)) >>> 0
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join('.')
}

export const buildDhcpEthernetCommand = () => ETHERNET_DHCP_COMMAND

export const buildStaticEthernetCommand = (settings: StaticEthernetSettings) => {
  const netmask = prefixLengthToNetmask(settings.prefixLength)
  const commands = [
    buildWriteFileCommand(
      NETWORK_INTERFACES_PATH,
      [
        '# interfaces(5) file used by ifup(8) and ifdown(8)',
        'auto lo',
        'iface lo inet loopback',
        'auto eth0',
        'iface eth0 inet static',
        `  address ${settings.ipAddress}`,
        `  netmask ${netmask}`,
        `  gateway ${settings.gateway}`,
      ].join('\n')
    ),
    'uci set network.wan.proto=static',
    `uci set network.wan.ipaddr=${quoteForShell(settings.ipAddress)}`,
    `uci set network.wan.netmask=${quoteForShell(netmask)}`,
    `uci set network.wan.gateway=${quoteForShell(settings.gateway)}`,
    '(uci -q delete network.wan.dns >/dev/null 2>&1 || true)',
    '(uci -q delete network.wan.dns_1 >/dev/null 2>&1 || true)',
    '(uci -q delete network.wan.dns_2 >/dev/null 2>&1 || true)',
    'uci set network.wan.peerdns=0',
    `for pid in $(ps w | awk '/[u]dhcpc/ && /-i eth0/ { print $1 }'); do kill "$pid" 2>/dev/null; done`,
  ]

  if (settings.primaryDns) commands.push(`uci set network.wan.dns_1=${quoteForShell(settings.primaryDns)}`)
  if (settings.secondaryDns) commands.push(`uci set network.wan.dns_2=${quoteForShell(settings.secondaryDns)}`)

  commands.push(
    'uci commit network',
    '{ (sleep 2; /etc/init.d/S40network restart) >/dev/null 2>&1 & :; }'
  )

  return commands.join(' && ')
}

export const buildDhcpFallbackCommand = (settings: DhcpFallbackSettings) => {
  const commands = [
    buildWriteFileCommand(DHCP_FALLBACK_SCRIPT_PATH, DHCP_FALLBACK_SCRIPT),
    `chmod 700 ${quoteForShell(DHCP_FALLBACK_SCRIPT_PATH)}`,
    'touch /etc/config/gateway_fallback',
    'uci set gateway_fallback.wan=dhcp_fallback',
    "uci set gateway_fallback.wan.enabled='1'",
    `uci set gateway_fallback.wan.ipaddr=${quoteForShell(settings.ipAddress)}`,
    `uci set gateway_fallback.wan.netmask=${quoteForShell(prefixLengthToNetmask(settings.prefixLength))}`,
    `uci set gateway_fallback.wan.gateway=${quoteForShell(settings.gateway)}`,
    `uci set gateway_fallback.wan.primary_dns=${quoteForShell(settings.primaryDns ?? '')}`,
    `uci set gateway_fallback.wan.failure_threshold='${DHCP_FALLBACK_FAILURE_THRESHOLD}'`,
    `uci set gateway_fallback.wan.cooldown_seconds='${DHCP_FALLBACK_COOLDOWN_SECONDS}'`,
    'uci commit gateway_fallback',
    `(grep -F -q ${quoteForShell(DHCP_FALLBACK_SCRIPT_PATH)} /etc/crontabs/root || echo ${quoteForShell(DHCP_FALLBACK_CRON_LINE)} >> /etc/crontabs/root)`,
    '{ (/etc/init.d/S21cron restart) >/dev/null 2>&1 & :; }',
  ]

  if (settings.secondaryDns) {
    commands.splice(
      9,
      0,
      `uci set gateway_fallback.wan.secondary_dns=${quoteForShell(settings.secondaryDns)}`
    )
  }

  return commands.join(' && ')
}

export const buildDisableDhcpFallbackCommand = () => DISABLE_DHCP_FALLBACK_COMMAND

export const buildArmStaticRollbackCommand = (token: string, timeoutSeconds: number) => {
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 600) {
    throw new Exception('Invalid static rollback timeout.', {
      status: 422,
      code: 'E_GATEWAY_STATIC_ROLLBACK_TIMEOUT_INVALID',
    })
  }

  const script = [
    '#!/bin/sh',
    `TOKEN_FILE=${quoteForShell(STATIC_ROLLBACK_TOKEN_PATH)}`,
    `PID_FILE=${quoteForShell(STATIC_ROLLBACK_PID_PATH)}`,
    `NETWORK_BACKUP=${quoteForShell(STATIC_ROLLBACK_NETWORK_BACKUP_PATH)}`,
    `INTERFACES_BACKUP=${quoteForShell(STATIC_ROLLBACK_INTERFACES_BACKUP_PATH)}`,
    `ADDRESSES_BACKUP=${quoteForShell(STATIC_ROLLBACK_ADDRESSES_BACKUP_PATH)}`,
    'token="$1"',
    '[ -n "$token" ] || exit 1',
    '[ -f "$TOKEN_FILE" ] || exit 0',
    '[ "$(cat "$TOKEN_FILE")" = "$token" ] || exit 0',
    '[ -f "$NETWORK_BACKUP" ] && cp "$NETWORK_BACKUP" /etc/config/network',
    '[ -f "$INTERFACES_BACKUP" ] && cp "$INTERFACES_BACKUP" /etc/network/interfaces',
    'uci commit network',
    'if [ -f "$ADDRESSES_BACKUP" ]; then',
    "  ip -4 -o addr show dev eth0 scope global | awk '{print $4}' | while read -r address; do",
    '    grep -F -x -q "$address" "$ADDRESSES_BACKUP" || ip -4 addr del "$address" dev eth0',
    '  done',
    'fi',
    'rm -f "$TOKEN_FILE" "$PID_FILE" "$NETWORK_BACKUP" "$INTERFACES_BACKUP" "$ADDRESSES_BACKUP"',
    'logger -t gateway-static-rollback "Restored previous network configuration"',
    '( sleep 2; /etc/init.d/S40network restart ) >/dev/null 2>&1 &',
  ].join('\n')

  return [
    `cp /etc/config/network ${quoteForShell(STATIC_ROLLBACK_NETWORK_BACKUP_PATH)}`,
    `cp ${quoteForShell(NETWORK_INTERFACES_PATH)} ${quoteForShell(STATIC_ROLLBACK_INTERFACES_BACKUP_PATH)}`,
    `ip -4 -o addr show dev eth0 scope global | awk '{print $4}' > ${quoteForShell(STATIC_ROLLBACK_ADDRESSES_BACKUP_PATH)}`,
    buildWriteFileCommand(STATIC_ROLLBACK_SCRIPT_PATH, script),
    `chmod 700 ${quoteForShell(STATIC_ROLLBACK_SCRIPT_PATH)}`,
    `printf %s ${quoteForShell(token)} > ${quoteForShell(STATIC_ROLLBACK_TOKEN_PATH)}`,
    `kill "$(cat ${quoteForShell(STATIC_ROLLBACK_PID_PATH)} 2>/dev/null)" 2>/dev/null || true`,
    `(sleep ${timeoutSeconds}; ${quoteForShell(STATIC_ROLLBACK_SCRIPT_PATH)} ${quoteForShell(token)}) >/dev/null 2>&1 & echo $! > ${quoteForShell(STATIC_ROLLBACK_PID_PATH)}`,
  ].join(' && ')
}

export const buildCancelStaticRollbackCommand = (token: string) =>
  [
    `[ -f ${quoteForShell(STATIC_ROLLBACK_TOKEN_PATH)} ]`,
    `[ "$(cat ${quoteForShell(STATIC_ROLLBACK_TOKEN_PATH)})" = ${quoteForShell(token)} ]`,
    `kill "$(cat ${quoteForShell(STATIC_ROLLBACK_PID_PATH)} 2>/dev/null)" 2>/dev/null || true`,
    `rm -f ${quoteForShell(STATIC_ROLLBACK_TOKEN_PATH)} ${quoteForShell(STATIC_ROLLBACK_PID_PATH)} ${quoteForShell(STATIC_ROLLBACK_NETWORK_BACKUP_PATH)} ${quoteForShell(STATIC_ROLLBACK_INTERFACES_BACKUP_PATH)} ${quoteForShell(STATIC_ROLLBACK_ADDRESSES_BACKUP_PATH)} ${quoteForShell(STATIC_ROLLBACK_SCRIPT_PATH)}`,
  ].join(' && ')
