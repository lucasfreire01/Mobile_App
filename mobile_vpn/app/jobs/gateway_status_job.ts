import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'
import env from '#start/env'
import GatewayMonitorLeaseService, {
  type MonitorLease,
} from '#services/gateway_monitor_lease_service'

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
  private readonly leases = new GatewayMonitorLeaseService()
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
    const stats = {
      skipped: false,
      checked: 0,
      offline: 0,
      writeErrors: 0,
      budgetExhausted: false,
      leaseLost: false,
    }
    if (this.running) return { ...stats, skipped: true }
    this.running = true
    const cycle = new AbortController()
    let cycleTimer: ReturnType<typeof setTimeout> | undefined
    let lease: MonitorLease | null = null
    try {
      lease = await this.leases.acquire(this.cycleTimeoutMs + 30_000)
      if (!lease) return { ...stats, skipped: true }
      let cursor = lease.cursor
      const ownedLease = lease
      cycleTimer = setTimeout(() => cycle.abort(), this.cycleTimeoutMs)
      const lostLease = () => {
        stats.leaseLost = true
        cycle.abort()
      }
      while (!cycle.signal.aborted) {
        const gateways = await Gateway.query()
          .select('id', 'management_ip_address', 'ssh_host_key_fingerprint')
          .whereNotNull('management_ip_address')
          .where('id', '>', cursor)
          .orderBy('id', 'asc')
          .limit(this.batchSize)
        if (!gateways.length) {
          if (!(await this.leases.resetCursor(ownedLease))) lostLease()
          break
        }
        let next = 0
        const worker = async () => {
          while (!cycle.signal.aborted) {
            const gateway = gateways[next++]
            if (!gateway) return
            if (!(await this.leases.advanceCursor(ownedLease, gateway.id))) {
              lostLease()
              return
            }
            cursor = Math.max(cursor, gateway.id)
            if (cycle.signal.aborted) return
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
              if (!(await this.leases.publish(ownedLease, gateway, update))) lostLease()
            } catch {
              stats.writeErrors++
            }
          }
        }
        const workers = Array.from({ length: Math.min(this.concurrency, gateways.length) }, worker)
        try {
          await Promise.all(workers)
        } catch (error) {
          cycle.abort()
          await Promise.allSettled(workers)
          throw error
        }
      }
      stats.budgetExhausted = cycle.signal.aborted && !stats.leaseLost
      return stats
    } finally {
      clearTimeout(cycleTimer)
      cycle.abort()
      try {
        if (lease) await this.leases.release(lease)
      } finally {
        this.running = false
      }
    }
  }
}
