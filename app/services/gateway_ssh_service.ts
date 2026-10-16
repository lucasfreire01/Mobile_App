import type Gateway from '#models/gateway'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'

const HOSTNAME_COMMAND = 'hostname'
// Browan firmware: interface is 'wan', not 'lan'. Reload via S40network.
// Reload runs in background after 2s so the SSH session closes cleanly first.
const NETWORK_CONFIG_COMMAND = 'uci show network'
const ETHERNET_DHCP_COMMAND =
  'uci set network.wan.proto=dhcp && ' +
  'uci -q delete network.wan.ipaddr; ' +
  'uci -q delete network.wan.netmask; ' +
  'uci -q delete network.wan.gateway; ' +
  'uci commit network && (sleep 2; /etc/init.d/S40network restart) >/dev/null 2>&1 &'

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

  /**
   * Tests SSH connectivity. Resolves if connected, rejects otherwise.
   * Used by GatewayStatusJob to check online/offline status.
   */
  async ping(gateway: Gateway): Promise<void> {
    const client = await this.connect(gateway)
    client.end()
  }
}

