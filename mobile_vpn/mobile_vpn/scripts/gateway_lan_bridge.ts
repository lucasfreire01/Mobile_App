// Node 24: node scripts/gateway_lan_bridge.ts <Wi-Fi IP> <Ethernet IP>
// Discovery carries public identity only. Pairing uses the authenticated HTTPS relay.
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { execFileSync } from 'node:child_process'
import { cpus, hostname, networkInterfaces, userInfo } from 'node:os'
import { readFileSync } from 'node:fs'
import { BridgePairingRelay, bootstrapBridgeInstallation, prepareBridgeInstallation } from './bridge_pairing_relay.ts'
import { fileURLToPath } from 'node:url'

type LocalIPv4Interface = { name: string; address: string; netmask: string }
function readInterfaces(): LocalIPv4Interface[] {
  return Object.entries(networkInterfaces()).flatMap(
  ([name, records]) =>
    (records ?? [])
      .filter(
        (record) =>
          !record.internal &&
          record.family === 'IPv4' &&
          net.isIPv4(record.address) &&
          net.isIPv4(record.netmask)
      )
      .map((record) => ({ name, address: record.address, netmask: record.netmask }))
  )
}
const interfaces = readInterfaces()
const ignoredInterface =
  /virtual|loopback|bluetooth|tailscale|zerotier|vpn|tunnel|docker|podman|wsl|hyper-v|vethernet|bridge/i
function selectInterface(label: string, pattern: RegExp) {
  const matches = interfaces.filter(
    (item) => !ignoredInterface.test(item.name) && pattern.test(item.name)
  )
  if (matches.length !== 1) {
    const choices = matches.map((item) => `${item.name}=${item.address}`).join(', ') || 'none'
    throw new Error(
      `Expected one ${label} IPv4 interface, found ${choices}. Pass Wi-Fi and Ethernet IPs explicitly to override.`
    )
  }
  return matches[0].address
}
const suppliedAddresses = process.argv.slice(2)
if (suppliedAddresses.length !== 0 && suppliedAddresses.length !== 2) {
  throw new Error(
    'Pass either no arguments for automatic detection or both Wi-Fi and Ethernet IPv4 addresses'
  )
}
const [bind, ethernet] =
  suppliedAddresses.length === 2
    ? suppliedAddresses
    : [
        selectInterface('Wi-Fi', /(^wl|wi-?fi|wlan|wireless)/i),
        selectInterface('Ethernet', /(^en[opsx]|^eth\d|ethernet|local area connection)/i),
      ]
if (!net.isIPv4(bind) || !net.isIPv4(ethernet)) throw new Error('IPv4 required')
const wifiPrefix = bind.split('.').slice(0, 3).join('.') + '.'
const MAX_HOSTS_PER_NETWORK = 4096
const MAX_CANDIDATES = 8192
const devices = new Map<
  string,
  { ip: string; model: string; mac: string; serial: string; port: number }
>()
const tunnels = new Map<string, net.Server>()
const allocatedPorts = new Map<string, number>()
let pairingRelay: BridgePairingRelay | undefined
let pairingUpdating = false
const installationPath =
  process.env.SAGANEXUS_BRIDGE_CONFIG ?? fileURLToPath(new URL('./bridge.json', import.meta.url))
async function updatePairing(
  preparedInstallation?: Awaited<ReturnType<typeof prepareBridgeInstallation>> | null
) {
  if (pairingUpdating) return
  pairingUpdating = true
  try {
    if (!pairingRelay) {
      try {
        const installation =
          preparedInstallation === undefined
            ? await prepareBridgeInstallation(installationPath)
            : preparedInstallation
        if (!installation) return
        pairingRelay = new BridgePairingRelay(installation.apiUrl, {
          identity: installation.identity,
          onEvent: (event) => console.log(`Pareamento: ${event}`),
        })
      } catch {
        // Discovery remains available; retry automatically when installation/network is ready.
        return
      }
    }
    await pairingRelay.tick([...devices.values()])
  } finally {
    pairingUpdating = false
  }
}

function pcModel() {
  if (process.platform === 'win32') {
    try {
      const value = execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '(Get-CimInstance Win32_ComputerSystem).Model',
        ],
        { encoding: 'utf8', timeout: 3000, windowsHide: true }
      ).trim()
      if (value) return value
    } catch {}
  }
  for (const path of [
    '/sys/class/dmi/id/product_name',
    '/sys/devices/virtual/dmi/id/product_name',
  ]) {
    try {
      const value = readFileSync(path, 'utf8').trim()
      if (value && value !== 'System Product Name' && value !== 'To Be Filled By O.E.M.')
        return value
    } catch {}
  }
  return `${hostname()} (${cpus()[0]?.model ?? 'PC'})`
}
const pcIdentity = { model: pcModel(), username: userInfo().username }
function allowed(address = '') {
  const source = address.startsWith('::ffff:') ? address.slice(7) : address
  return source === '127.0.0.1' || source === '::1' || source.startsWith(wifiPrefix) || source === bind
}
function identity(ip: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    // Self-signed firmware certificates are accepted ONLY for public discovery.
    // No enrollment code or credentials are sent by this request.
    const request = https.get(
      {
        hostname: ip,
        path: '/cgi-bin/saganexus_enroll.cgi?identity=1',
        rejectUnauthorized: false,
        timeout: 1800,
      },
      (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk
          if (body.length > 4096) request.destroy()
        })
        response.on('end', () => {
          try {
            resolve(response.statusCode === 200 ? JSON.parse(body) : null)
          } catch {
            resolve(null)
          }
        })
        response.on('error', () => resolve(null))
      }
    )
    request.on('timeout', () => request.destroy())
    request.on('error', () => resolve(null))
  })
}
export async function scan() {
  const networks = readInterfaces()
    .filter((item) => !ignoredInterface.test(item.name))
    .map(({ address, netmask }) => {
      const ip = address.split('.').map(Number)
      const mask = netmask.split('.').map(Number)
      const network = ip.map((octet, index) => octet & mask[index])
      const hostCount = Math.min(
        MAX_HOSTS_PER_NETWORK,
        2 ** (32 - mask.reduce((value, octet) => value + octet.toString(2).split('0').join('').length, 0))
      )
      return { network, hostCount }
    })
  const queue = networks.flatMap(({ network, hostCount }) =>
    Array.from({ length: hostCount }, (_, offset) => {
      const value = network.reduce((result, octet, index) => result + (octet << (24 - index * 8)), offset)
      return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.')
    })
  ).filter((ip, index, ips) => ip !== ethernet && index < MAX_CANDIDATES && ips.indexOf(ip) === index)
  const seen = new Set<string>()
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      for (let ip = queue.shift(); ip; ip = queue.shift()) {
        const data = await identity(ip)
        if (
          !data ||
          typeof data.model !== 'string' ||
          typeof data.mac !== 'string' ||
          !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(data.mac)
        )
          continue
        seen.add(ip)
        if (!tunnels.has(ip)) {
          if (tunnels.size >= 64) continue
          const usedPorts = new Set(allocatedPorts.values())
          const port = Array.from({ length: 64 }, (_, i) => 8800 + i).find(
            (value) => !usedPorts.has(value)
          )
          if (port === undefined) continue
          allocatedPorts.set(ip, port)
          const server = net.createServer((client) => {
            if (!allowed(client.remoteAddress)) {
              client.destroy()
              return
            }
            const upstream = net.connect(443, ip)
            client.setTimeout(60000, () => client.destroy())
            upstream.setTimeout(60000, () => upstream.destroy())
            client.on('error', () => upstream.destroy())
            upstream.on('error', () => client.destroy())
            client.on('close', () => upstream.destroy())
            upstream.on('close', () => client.destroy())
            client.pipe(upstream).pipe(client)
          })
          try {
            await new Promise<void>((resolve, reject) => {
              server.once('error', reject)
              server.listen(port, bind, resolve)
            })
          } catch {
            allocatedPorts.delete(ip)
            continue
          }
          tunnels.set(ip, server)
          devices.set(ip, {
            ip,
            model: data.model,
            mac: data.mac,
            serial: typeof data.serial === 'string' ? data.serial : '',
            port,
          })
        }
      }
    })
  )
  for (const ip of devices.keys())
    if (!seen.has(ip)) {
      devices.delete(ip)
      tunnels.get(ip)?.close()
      tunnels.delete(ip)
      allocatedPorts.delete(ip)
    }
  console.log(`Discovery: ${devices.size} gateway(s)`)
}
// Complete initial discovery/activation before accepting discovery requests.
const initialInstallation = prepareBridgeInstallation(installationPath).catch(() => null)
await scan()
await updatePairing(await initialInstallation)
http
  .createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!allowed(req.socket.remoteAddress)) {
      res.writeHead(404).end()
      return
    }
    if (req.method === 'POST' && req.url === '/saganexus-bootstrap') {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
        if (body.length > 4096) req.destroy()
      })
      req.on('end', async () => {
        try {
          const input = JSON.parse(body)
          const installation = await bootstrapBridgeInstallation(installationPath, input)
          await updatePairing(installation)
          res.writeHead(204).end()
        } catch {
          res.writeHead(400).end()
        }
      })
      return
    }
    if (req.method !== 'GET' || req.url !== '/saganexus-discovery') {
      res.writeHead(404).end()
      return
    }
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        service: 'saganexus-lan-bridge-v1',
        pc: pcIdentity,
        gateways: [...devices.values()],
        ...(pairingRelay?.publicSession() ? { pairing: pairingRelay.publicSession() } : {}),
      })
    )
  })
  .listen(8787, bind)
console.log(`Bridge listening at ${bind}:8787`)
setInterval(() => void updatePairing(), 4000)
const timer = setInterval(() => {
  clearInterval(timer)
  void repeat()
}, 30000)
async function repeat() {
  await scan()
  setTimeout(() => void repeat(), 30000)
}
process.on('SIGINT', () => process.exit(0))
