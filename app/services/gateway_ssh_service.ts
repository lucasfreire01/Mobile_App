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

const HOSTNAME_COMMAND = 'hostname'
// Browan firmware: interface is 'wan', not 'lan'. Reload via S40network.
// Reload runs in background after 2s so the SSH session closes cleanly first.
const NETWORK_CONFIG_COMMAND = 'uci show network'
const ETHERNET_DHCP_COMMAND = [
  'uci set network.wan.proto=dhcp',
  '(uci -q delete network.wan.ipaddr >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.netmask >/dev/null 2>&1 || true)',
  '(uci -q delete network.wan.gateway >/dev/null 2>&1 || true)',
  'uci commit network',
  '{ (sleep 2; /etc/init.d/S40network restart) >/dev/null 2>&1 & :; }',
].join(' && ')

const quoteForShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

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
    'uci set network.wan.proto=static',
    `uci set network.wan.ipaddr=${quoteForShell(settings.ipAddress)}`,
    `uci set network.wan.netmask=${quoteForShell(prefixLengthToNetmask(settings.prefixLength))}`,
    `uci set network.wan.gateway=${quoteForShell(settings.gateway)}`,
    '(uci -q delete network.wan.dns >/dev/null 2>&1 || true)',
    'uci set network.wan.peerdns=0',
  ]

  for (const dns of [settings.primaryDns, settings.secondaryDns]) {
    if (dns) commands.push(`uci add_list network.wan.dns=${quoteForShell(dns)}`)
  }

  commands.push(
    'uci commit network',
    '{ (sleep 2; /etc/init.d/S40network restart) >/dev/null 2>&1 & :; }'
  )

  return commands.join(' && ')
}
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
      client.exec(command, (error, stream) => {
        if (error) {
          client.end()
          reject(
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
          client.end()

          if (code === 0) {
            resolve(output)
            return
          }

          reject(
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
