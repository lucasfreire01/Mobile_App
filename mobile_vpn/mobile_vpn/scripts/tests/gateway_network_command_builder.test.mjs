import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDhcpFallbackCommand,
  buildStaticEthernetCommand,
} from '../../app/services/gateway_network_command_builder.ts'

const settings = {
  ipAddress: '192.0.2.10',
  prefixLength: 24,
  gateway: '192.0.2.1',
  primaryDns: '192.0.2.53',
}

test('DHCP fallback saves or clears secondary DNS before committing', () => {
  const withDns = buildDhcpFallbackCommand({ ...settings, secondaryDns: '192.0.2.54' })
  const cleared = buildDhcpFallbackCommand({ ...settings, secondaryDns: null })

  assert.match(withDns, /uci set gateway_fallback\.wan\.secondary_dns='192\.0\.2\.54'.* && uci commit gateway_fallback/)
  assert.match(cleared, /uci set gateway_fallback\.wan\.secondary_dns=''.* && uci commit gateway_fallback/)
})

test('static and DHCP fallback commands reject legacy IPv6 addresses and gateways', () => {
  for (const buildCommand of [buildStaticEthernetCommand, buildDhcpFallbackCommand]) {
    for (const field of ['ipAddress', 'gateway']) {
      assert.throws(
        () => buildCommand({ ...settings, [field]: '2001:db8::1' }),
        { code: 'E_GATEWAY_STATIC_IPV4_REQUIRED', status: 422 }
      )
    }
  }
})
