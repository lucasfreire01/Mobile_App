import { BlockList, isIP } from 'node:net'
import env from '#start/env'
import { Exception } from '@adonisjs/core/exceptions'

export function ensureAllowedSshAddress(address: string) {
  const ranges = env.get(
    'GATEWAY_SSH_ALLOWED_CIDRS',
    `${env.get('GATEWAY_MGMT_IP_PREFIX', '10.200.0')}.0/24`
  )
  const allowed = new BlockList()
  try {
    for (const range of ranges.split(',')) {
      const parts = range.trim().split('/')
      const [network, bits] = parts
      const family = isIP(network)
      const prefix = Number(bits)
      if (
        parts.length !== 2 ||
        !bits ||
        !/^\d+$/.test(bits) ||
        !family ||
        prefix < 0 ||
        prefix > (family === 4 ? 32 : 128)
      ) {
        throw new Error('Invalid SSH allowlist')
      }
      allowed.addSubnet(network, prefix, family === 4 ? 'ipv4' : 'ipv6')
    }
  } catch {
    throw new Exception('Invalid gateway SSH destination allowlist.', {
      status: 503,
      code: 'E_GATEWAY_SSH_ALLOWLIST_INVALID',
    })
  }
  const family = isIP(address)
  // Literal addresses only: do not permit DNS names or DNS rebinding.
  if (!family || !allowed.check(address, family === 4 ? 'ipv4' : 'ipv6')) {
    throw new Exception('Gateway SSH destination is not allowed.', {
      status: 422,
      code: 'E_GATEWAY_SSH_ADDRESS_NOT_ALLOWED',
    })
  }
  return address
}
