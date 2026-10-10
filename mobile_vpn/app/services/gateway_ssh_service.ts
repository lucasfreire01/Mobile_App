import type Gateway from '#models/gateway'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'
import { readFileSync } from 'node:fs'
import { Client } from 'ssh2'

export default class GatewaySshService {
  ensureConnectionAddress(gateway: Gateway) {
    if (!gateway.ipAddress) {
      throw new Exception('Missing IP with ssh connection', {
        status: 422,
        code: 'E_GATEWAY_IP_REQUIRED',
      })
    }

    return gateway.ipAddress
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

      client.once('error', () => {
        reject(
          new Exception('Connection ssh reject', {
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

  async getHostname(gateway: Gateway): Promise<string> {
    const client = await this.connect(gateway)

    return new Promise((resolve, reject) => {
      client.exec('hostname', (error, stream) => {
        if (error) {
          client.end()
          reject(error)
          return
        }

        let output = ''

        stream.on('data', (data: Buffer) => {
          output += data.toString()
        })

        stream.on('close', (code: number | null) => {
          client.end()

          if (code === 0) {
            const hostname = output.trim()

            if (!hostname) {
              reject(
                new Exception('Not hostname Gateway return ', {
                  status: 502,
                  code: 'E_GATEWAY_HOSTNAME_EMPTY',
                })
              )
              return
            }

            resolve(hostname)
            return
          }

          reject(
            new Exception('Cannot have gateway name', {
              status: 502,
              code: 'E_GATEWAY_SSH_COMMAND_FAILED',
            })
          )
        })
      })
    })
  }
}
