import type Gateway from '#models/gateway'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'

export type StaticEthernetSettings = {
  ipAddress: string
  prefixLength: number
  gateway: string
  primaryDns?: string | null
  secondaryDns?: string | null
}

/**
 * Static profile kept locally while DHCP remains the active WAN mode.
 */
export type DhcpFallbackSettings = StaticEthernetSettings

const HOSTNAME_COMMAND = 'hostname'
const SSH_COMMAND_TIMEOUT_MS = 30_000
// Browan firmware: interface is 'wan', not 'lan'. Reload via S40network.
// Reload runs in background after 2s so the SSH session closes cleanly first.
const NETWORK_CONFIG_COMMAND = 'uci show network'
const DHCP_FALLBACK_SCRIPT_PATH = '/usr/sbin/gateway_dhcp_fallback.sh'
const DHCP_FALLBACK_CRON_LINE = '* * * * * /usr/sbin/gateway_dhcp_fallback.sh >/dev/null 2>&1'
const NETWORK_INTERFACES_PATH = '/etc/network/interfaces'
export const DHCP_FALLBACK_FAILURE_THRESHOLD = 3
export const DHCP_FALLBACK_COOLDOWN_SECONDS = 900

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

const quoteForShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const buildWriteFileCommand = (path: string, content: string) => {
  const lines = content.trimEnd().split('\n').map(quoteForShell).join(' ')
  return `printf '%s\\n' ${lines} > ${quoteForShell(path)}`
}

const prefixLengthToNetmask = (prefixLength: number) => {
  if (!Number.isInteger(prefixLength) || prefixLength < 1 || prefixLength > 32) {
    throw new Exception('Invalid IPv4 prefix length.', {
      status: 422,
      code: 'E_GATEWAY_STATIC_PREFIX_INVALID',
    })
  }

  const mask = (0xffffffff << (32 - prefixLength)) >>> 0
  return [24, 16, 8, 0].map((shift) => (mask >>> shift) & 255).join('.')
}

const buildStaticEthernetCommand = (settings: StaticEthernetSettings) => {
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
        `  netmask ${prefixLengthToNetmask(settings.prefixLength)}`,
        `  gateway ${settings.gateway}`,
      ].join('\n')
    ),
    'uci set network.wan.proto=static',
    `uci set network.wan.ipaddr=${quoteForShell(settings.ipAddress)}`,
    `uci set network.wan.netmask=${quoteForShell(prefixLengthToNetmask(settings.prefixLength))}`,
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

const DISABLE_DHCP_FALLBACK_COMMAND = [
  'uci set gateway_fallback.wan=dhcp_fallback',
  "uci set gateway_fallback.wan.enabled='0'",
  'uci commit gateway_fallback',
].join(' && ')
// Gets the current WAN IP: `ip route get 1` returns the source address used to reach the internet.
// Example output: "1.0.0.0 via 192.168.11.1 dev eth0 src 192.168.11.10 uid 0"
const CURRENT_WAN_IP_COMMAND =
  "ip route get 1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}'"

export default class GatewaySshService {
  ensureConnectionAddress(gateway: Gateway) {
    if (!gateway.managementIpAddress) {
      throw new Exception('Missing gateway management IP for SSH', {
        status: 422,
        code: 'E_GATEWAY_IP_REQUIRED',
      })
    }

    return gateway.managementIpAddress
  }

  readPrivateKey() {
    return readFileSync(env.get('BROWAN_SSH_KEY_PATH'))
  }

  async connect(gateway: Gateway): Promise<Client> {
    const host = this.ensureConnectionAddress(gateway)

    return this.connectToAddress(host)
  }

  async connectToAddress(host: string): Promise<Client> {
    const privateKey = this.readPrivateKey()

    return new Promise((resolve, reject) => {
      const client = new Client()

      client.once('ready', () => {
        resolve(client)
      })

      client.once('error', (err: Error) => {
        reject(
          new Exception(`SSH connection failed: ${err.message}`, {
            status: 502,
            code: 'E_GATEWAY_SSH_CONNECTION_FAILED',
          })
        )
      })

      client.connect({
        host,
        port: env.get('BROWAN_SSH_PORT'),
        username: env.get('BROWAN_SSH_USERNAME'),
        privateKey,
        readyTimeout: 10_000,
      })
    })
  }

  private async runCommand(gateway: Gateway, command: string, errorCode: string): Promise<string> {
    const client = await this.connect(gateway)

    return new Promise((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        finish(
          new Exception('Gateway command timed out.', {
            status: 504,
            code: 'E_GATEWAY_SSH_COMMAND_TIMEOUT',
          })
        )
      }, SSH_COMMAND_TIMEOUT_MS)

      const finish = (error?: Error, output?: string) => {
        if (settled) return

        settled = true
        clearTimeout(timeout)
        client.end()

        if (error) {
          reject(error)
          return
        }

        resolve(output ?? '')
      }

      client.exec(command, (error, stream) => {
        if (error) {
          finish(
            new Exception('Cannot run command on gateway', {
              status: 502,
              code: errorCode,
            })
          )
          return
        }

        let output = ''

        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })

        stream.stderr.on('data', (data: Buffer) => {
          output += data.toString()
        })

        stream.on('close', (code: number | null) => {
          if (code === 0) {
            finish(undefined, output)
            return
          }

          finish(
            new Exception(`Gateway command failed: ${output.trim()}`, {
              status: 502,
              code: errorCode,
            })
          )
        })
      })
    })
  }

  async getHostname(gateway: Gateway): Promise<string> {
    const output = await this.runCommand(gateway, HOSTNAME_COMMAND, 'E_GATEWAY_SSH_COMMAND_FAILED')

    const hostname = output.trim()

    if (!hostname) {
      throw new Exception('Not hostname Gateway return ', {
        status: 502,
        code: 'E_GATEWAY_HOSTNAME_EMPTY',
      })
    }

    return hostname
  }

  async getEthernetConfig(gateway: Gateway): Promise<string> {
    const output = await this.runCommand(
      gateway,
      NETWORK_CONFIG_COMMAND,
      'E_GATEWAY_ETH_READ_FAILED'
    )

    return output.trim()
  }

  async setEthernetModeDhcp(gateway: Gateway): Promise<void> {
    await this.runCommand(gateway, ETHERNET_DHCP_COMMAND, 'E_GATEWAY_ETH_COMMAND_FAILED')
  }

  async configureDhcpFallback(
    gateway: Gateway,
    settings: DhcpFallbackSettings
  ): Promise<void> {
    await this.runCommand(
      gateway,
      buildDhcpFallbackCommand(settings),
      'E_GATEWAY_DHCP_FALLBACK_CONFIG_FAILED'
    )
  }

  async disableDhcpFallback(gateway: Gateway): Promise<void> {
    await this.runCommand(
      gateway,
      DISABLE_DHCP_FALLBACK_COMMAND,
      'E_GATEWAY_DHCP_FALLBACK_DISABLE_FAILED'
    )
  }

  async setEthernetModeStatic(gateway: Gateway, settings: StaticEthernetSettings): Promise<void> {
    await this.runCommand(
      gateway,
      buildStaticEthernetCommand(settings),
      'E_GATEWAY_ETH_COMMAND_FAILED'
    )
  }

  async waitForConnection(address: string, attempts = 12, delayMs = 5_000): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const client = await this.connectToAddress(address)
        client.end()
        return
      } catch {
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, delayMs))
        }
      }
    }

    throw new Exception('Gateway did not reconnect on its new static IP.', {
      status: 502,
      code: 'E_GATEWAY_STATIC_RECONNECT_FAILED',
    })
  }

  /**
   * Returns the current WAN IP address of the gateway.
   * Uses `ip route get 1` to find the source address used to reach the internet.
   * Returns null if the command fails or the output is empty/invalid.
   */
  async getCurrentWanIp(gateway: Gateway): Promise<string | null> {
    try {
      const output = await this.runCommand(
        gateway,
        CURRENT_WAN_IP_COMMAND,
        'E_GATEWAY_WAN_IP_FAILED'
      )
      const ip = output.trim()
      const octets = ip.split('.').map(Number)
      const isValidIpv4 =
        octets.length === 4 &&
        octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)

      return isValidIpv4 ? ip : null
    } catch {
      return null
    }
  }

  /**
   * Tests SSH connectivity. Resolves if connected, rejects otherwise.
   * Used by GatewayStatusJob to check online/offline status.
   */
  async ping(gateway: Gateway): Promise<void> {
    const client = await this.connect(gateway)
    client.end()
  }
}
