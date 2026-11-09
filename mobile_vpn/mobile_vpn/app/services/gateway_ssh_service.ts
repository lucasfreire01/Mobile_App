import type Gateway from '#models/gateway'
import {
  buildArmStaticRollbackCommand,
  buildCancelStaticRollbackCommand,
  buildDhcpEthernetCommand,
  buildDhcpFallbackCommand,
  buildDisableDhcpFallbackCommand,
  buildStaticEthernetCommand,
  type DhcpFallbackSettings,
  type StaticEthernetSettings,
  STATIC_ROLLBACK_TIMEOUT_SECONDS,
} from '#services/gateway_network_command_builder'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'
import { isIP } from 'node:net'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

export type {
  DhcpFallbackSettings,
  StaticEthernetSettings,
} from '#services/gateway_network_command_builder'

const HOSTNAME_COMMAND = 'hostname'
const SSH_COMMAND_TIMEOUT_MS = 30_000
const NETWORK_CONFIG_COMMAND = 'uci show network'
// Gets the current WAN IP: `ip route get 1` returns the source address used to reach the internet.
// Example output: "1.0.0.0 via 192.168.11.1 dev eth0 src 192.168.11.10 uid 0"
const CURRENT_WAN_IP_COMMAND =
  "ip route get 1 2>/dev/null | grep -oE 'src [0-9.]+' | awk '{print $2}'"

export function getSshHostKeyFingerprint(hostKey: Buffer) {
  return `SHA256:${createHash('sha256').update(hostKey).digest('base64').replace(/=+$/, '')}`
}

export function isExpectedSshHostKey(hostKey: Buffer, expectedFingerprint: string) {
  return getSshHostKeyFingerprint(hostKey) === expectedFingerprint.replace(/=+$/, '')
}

export function createSshHostKeyVerifier(expectedFingerprint: string) {
  let rejected = false

  return {
    verify(hostKey: Buffer) {
      const matches = isExpectedSshHostKey(hostKey, expectedFingerprint)
      rejected ||= !matches
      return matches
    },
    wasRejected() {
      return rejected
    },
  }
}

export default class GatewaySshService {
  constructor(private readonly clientFactory: () => Client = () => new Client()) {}
  ensureConnectionAddress(gateway: Gateway) {
    if (!gateway.managementIpAddress) {
      throw new Exception('Missing gateway management IP for SSH', {
        status: 422,
        code: 'E_GATEWAY_IP_REQUIRED',
      })
    }

    return ensureAllowedSshAddress(gateway.managementIpAddress)
  }

  readPrivateKey() {
    return readFileSync(env.get('BROWAN_SSH_KEY_PATH'))
  }

  private getExpectedHostKeyFingerprint(gateway: Gateway) {
    if (!gateway.sshHostKeyFingerprint) {
      throw new Exception('Gateway SSH host key fingerprint is not configured.', {
        status: 422,
        code: 'E_GATEWAY_SSH_HOST_KEY_NOT_PINNED',
      })
    }

    return gateway.sshHostKeyFingerprint
  }

  async connect(gateway: Gateway): Promise<Client> {
    const host = this.ensureConnectionAddress(gateway)

    return this.connectToAddress(host, this.getExpectedHostKeyFingerprint(gateway))
  }

  async connectToAddress(
    host: string,
    expectedHostKeyFingerprint: string,
    signal?: AbortSignal
  ): Promise<Client> {
    ensureAllowedSshAddress(host)
    if (signal?.aborted) throw new Error('Gateway monitoring cancelled')
    const privateKey = this.readPrivateKey()
    const hostKeyVerifier = createSshHostKeyVerifier(expectedHostKeyFingerprint)

    return new Promise((resolve, reject) => {
      const client = this.clientFactory()
      const abort = () => {
        client.destroy()
        reject(new Error('Gateway monitoring cancelled'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      client.once('close', () => signal?.removeEventListener('abort', abort))

      client.once('ready', () => {
        signal?.removeEventListener('abort', abort)
        resolve(client)
      })

      client.once('error', (err: Error) => {
        signal?.removeEventListener('abort', abort)
        client.destroy()
        reject(
          new Exception(
            hostKeyVerifier.wasRejected()
              ? 'Gateway SSH host key fingerprint does not match the registered gateway.'
              : `SSH connection failed: ${err.message}`,
            {
              status: 502,
              code: hostKeyVerifier.wasRejected()
                ? 'E_GATEWAY_SSH_HOST_KEY_MISMATCH'
                : 'E_GATEWAY_SSH_CONNECTION_FAILED',
            }
          )
        )
      })

      try {
        client.connect({
          host,
          port: env.get('BROWAN_SSH_PORT'),
          username: env.get('BROWAN_SSH_USERNAME'),
          privateKey,
          readyTimeout: 10_000,
          hostVerifier: (hostKey: Buffer) => hostKeyVerifier.verify(hostKey),
        })
      } catch (error) {
        signal?.removeEventListener('abort', abort)
        client.destroy()
        reject(error)
      }
    })
  }

  /** One cancellable connection for both liveness and WAN observation. */
  async probeStatus(
    gateway: Gateway,
    signal: AbortSignal
  ): Promise<{ wanIpAddress: string | null }> {
    const client = await this.connectToAddress(
      this.ensureConnectionAddress(gateway),
      this.getExpectedHostKeyFingerprint(gateway),
      signal
    )
    try {
      const wanIpAddress = await new Promise<string | null>((resolve) => {
        let settled = false
        let output = ''
        const finish = (ip: string | null) => {
          if (settled) return
          settled = true
          signal.removeEventListener('abort', abort)
          client.removeListener('error', failed)
          client.removeListener('close', failed)
          resolve(ip)
        }
        const failed = () => finish(null)
        const abort = () => {
          client.destroy()
          finish(null)
        }
        signal.addEventListener('abort', abort, { once: true })
        client.once('error', failed)
        client.once('close', failed)
        if (signal.aborted) {
          abort()
          return
        }
        client.exec(CURRENT_WAN_IP_COMMAND, (error, stream) => {
          if (error) {
            finish(null)
            return
          }
          stream.on('data', (data: Buffer) => {
            output += data.toString()
            if (output.length > 512) {
              client.destroy()
              finish(null)
            }
          })
          stream.once('error', failed)
          stream.once('close', (code: number | null) => {
            const address = output.trim()
            finish(code === 0 && isIP(address) === 4 ? address : null)
          })
        })
      })
      return { wanIpAddress }
    } finally {
      client.destroy()
    }
  }

  private async runCommand(gateway: Gateway, command: string, errorCode: string): Promise<string> {
    return this.runCommandAtAddress(
      gateway,
      this.ensureConnectionAddress(gateway),
      command,
      errorCode
    )
  }

  private async runCommandAtAddress(
    gateway: Gateway,
    address: string,
    command: string,
    errorCode: string
  ): Promise<string> {
    const client = await this.connectToAddress(address, this.getExpectedHostKeyFingerprint(gateway))

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
    await this.runCommand(gateway, buildDhcpEthernetCommand(), 'E_GATEWAY_ETH_COMMAND_FAILED')
  }

  async configureDhcpFallback(gateway: Gateway, settings: DhcpFallbackSettings): Promise<void> {
    await this.runCommand(
      gateway,
      buildDhcpFallbackCommand(settings),
      'E_GATEWAY_DHCP_FALLBACK_CONFIG_FAILED'
    )
  }

  async disableDhcpFallback(gateway: Gateway): Promise<void> {
    await this.runCommand(
      gateway,
      buildDisableDhcpFallbackCommand(),
      'E_GATEWAY_DHCP_FALLBACK_DISABLE_FAILED'
    )
  }

  async disableDhcpFallbackAtAddress(gateway: Gateway, address: string): Promise<void> {
    await this.runCommandAtAddress(
      gateway,
      address,
      buildDisableDhcpFallbackCommand(),
      'E_GATEWAY_DHCP_FALLBACK_DISABLE_FAILED'
    )
  }

  async armStaticRollback(gateway: Gateway, timeoutSeconds = STATIC_ROLLBACK_TIMEOUT_SECONDS) {
    const token = randomUUID()
    await this.runCommand(
      gateway,
      buildArmStaticRollbackCommand(token, timeoutSeconds),
      'E_GATEWAY_STATIC_ROLLBACK_ARM_FAILED'
    )
    return token
  }

  async cancelStaticRollback(gateway: Gateway, address: string, token: string): Promise<void> {
    await this.runCommandAtAddress(
      gateway,
      address,
      buildCancelStaticRollbackCommand(token),
      'E_GATEWAY_STATIC_ROLLBACK_CANCEL_FAILED'
    )
  }

  async setEthernetModeStatic(gateway: Gateway, settings: StaticEthernetSettings): Promise<void> {
    ensureAllowedSshAddress(settings.ipAddress)
    await this.runCommand(
      gateway,
      buildStaticEthernetCommand(settings),
      'E_GATEWAY_ETH_COMMAND_FAILED'
    )
  }

  async waitForConnection(
    gateway: Gateway,
    address: string,
    attempts = 12,
    delayMs = 5_000
  ): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const client = await this.connectToAddress(
          address,
          this.getExpectedHostKeyFingerprint(gateway)
        )
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
