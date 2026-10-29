import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'
import env from '#start/env'
import db from '@adonisjs/lucid/services/db'

type MonitorOptions = {
  concurrency?: number
  batchSize?: number
  probeTimeoutMs?: number
  cycleTimeoutMs?: number
  probe?: (gateway: Gateway, signal: AbortSignal) => Promise<{ wanIpAddress: string | null }>
}

function bounded(value: number, maximum: number) {
  if (!Number.isInteger(value) || value < 1 || value > maximum)
    throw new Error(`Gateway monitoring limit must be an integer between 1 and ${maximum}.`)
  return value
}

export default class GatewayStatusJob {
  readonly name = 'GatewayStatusJob'
  private running = false
  private cursor = 0
  private readonly concurrency: number
  private readonly batchSize: number
  private readonly probeTimeoutMs: number
  private readonly cycleTimeoutMs: number
  private readonly probe: NonNullable<MonitorOptions['probe']>

  constructor(options: MonitorOptions = {}) {
    this.concurrency = bounded(options.concurrency ?? env.get('GATEWAY_MONITOR_CONCURRENCY', 5), 20)
    this.batchSize = bounded(options.batchSize ?? env.get('GATEWAY_MONITOR_BATCH_SIZE', 50), 500)
    this.probeTimeoutMs = bounded(
      options.probeTimeoutMs ?? env.get('GATEWAY_MONITOR_TIMEOUT_MS', 15_000),
      60_000
    )
    this.cycleTimeoutMs = bounded(
      options.cycleTimeoutMs ?? env.get('GATEWAY_MONITOR_CYCLE_TIMEOUT_MS', 100_000),
      110_000
    )
    const ssh = new GatewaySshService()
    this.probe = options.probe ?? ((gateway, signal) => ssh.probeStatus(gateway, signal))
  }

  async run() {
    const stats = { skipped: false, checked: 0, offline: 0, writeErrors: 0, budgetExhausted: false }
    if (this.running) return { ...stats, skipped: true }
    this.running = true
    const cycle = new AbortController()
    const cycleTimer = setTimeout(() => cycle.abort(), this.cycleTimeoutMs)
    try {
      while (!cycle.signal.aborted) {
        const gateways = await Gateway.query()
          .select('id', 'management_ip_address', 'ssh_host_key_fingerprint')
          .whereNotNull('management_ip_address')
          .where('id', '>', this.cursor)
          .orderBy('id', 'asc')
          .limit(this.batchSize)
        if (!gateways.length) {
          this.cursor = 0
          break
        }
        let next = 0
        const worker = async () => {
          while (!cycle.signal.aborted) {
            const gateway = gateways[next++]
            if (!gateway) return
            this.cursor = gateway.id
            const controller = new AbortController()
            const cancel = () => controller.abort()
            cycle.signal.addEventListener('abort', cancel, { once: true })
            const timeout = setTimeout(cancel, this.probeTimeoutMs)
            const update: Record<string, string | Date> = {}
            try {
              const result = await this.probe(gateway, controller.signal)
              update.status = 'online'
              update.last_seen_at = new Date()
              if (result.wanIpAddress) {
                update.wan_ip_address = result.wanIpAddress
                update.wan_ip_observed_at = new Date()
              }
            } catch {
              update.status = 'offline'
            } finally {
              clearTimeout(timeout)
              cycle.signal.removeEventListener('abort', cancel)
            }
            // A cycle deadline is not evidence that the gateway is offline.
            if (cycle.signal.aborted) return
            stats.checked++
            if (update.status === 'offline') stats.offline++
            try {
              // Do not publish observations from an address changed during SSH.
              await db
                .from('gateways')
                .where('id', gateway.id)
                .where('management_ip_address', gateway.managementIpAddress!)
                .update(update)
            } catch {
              stats.writeErrors++
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(this.concurrency, gateways.length) }, worker)
        )
      }
      stats.budgetExhausted = cycle.signal.aborted
      return stats
    } finally {
      clearTimeout(cycleTimer)
      this.running = false
    }
  }
}
