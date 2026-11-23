import assert from 'node:assert/strict'
import test from 'node:test'
import { updateGatewayEthernetConfValidator } from '../../app/validators/gateway_ethernet_config.ts'

const staticConfig = {
  mode: 'static',
  staticIpAddress: '192.0.2.10',
  staticGateway: '192.0.2.1',
  primaryDns: '192.0.2.53',
}
const fallbackConfig = { ...staticConfig, mode: 'dhcp', dhcpFallbackEnabled: true }
const dhcpConfig = { mode: 'dhcp', dhcpFallbackEnabled: false }

function hasPrefixError(error) {
  return error.messages?.some((message) => message.field === 'staticPrefixLength') ?? false
}

test('static configuration accepts integer prefix lengths from 1 to 32', async () => {
  for (const prefix of [1, 24, 32]) {
    const config = await updateGatewayEthernetConfValidator.validate({
      ...staticConfig,
      staticPrefixLength: prefix,
    })
    assert.equal(config.staticPrefixLength, prefix)
  }
})

test('static configuration rejects decimal and out-of-range prefix lengths', async () => {
  for (const prefix of [24.5, 0, 33]) {
    await assert.rejects(
      updateGatewayEthernetConfValidator.validate({ ...staticConfig, staticPrefixLength: prefix }),
      hasPrefixError
    )
  }
})

test('static configuration and DHCP fallback require an integer prefix length', async () => {
  await assert.rejects(updateGatewayEthernetConfValidator.validate(staticConfig), hasPrefixError)
  await assert.rejects(updateGatewayEthernetConfValidator.validate(fallbackConfig), hasPrefixError)
  await assert.rejects(
    updateGatewayEthernetConfValidator.validate({ ...fallbackConfig, staticPrefixLength: 24.5 }),
    hasPrefixError
  )
  const config = await updateGatewayEthernetConfValidator.validate({
    ...fallbackConfig,
    staticPrefixLength: 24,
  })
  assert.equal(config.staticPrefixLength, 24)
})

test('DHCP without fallback requires an integer only when a prefix length is provided', async () => {
  const config = await updateGatewayEthernetConfValidator.validate(dhcpConfig)
  assert.equal(config.staticPrefixLength, undefined)

  const withPrefix = await updateGatewayEthernetConfValidator.validate({
    ...dhcpConfig,
    staticPrefixLength: 24,
  })
  assert.equal(withPrefix.staticPrefixLength, 24)
  await assert.rejects(
    updateGatewayEthernetConfValidator.validate({ ...dhcpConfig, staticPrefixLength: 24.5 }),
    hasPrefixError
  )
})

test('omitting secondary DNS preserves the existing value and null requests a clear', async () => {
  const profile = { ...staticConfig, staticPrefixLength: 24 }
  const omitted = await updateGatewayEthernetConfValidator.validate(profile)
  const cleared = await updateGatewayEthernetConfValidator.validate({
    ...profile,
    secondaryDns: null,
  })

  assert.equal(Object.hasOwn(omitted, 'secondaryDns'), false)
  assert.equal(Object.hasOwn(cleared, 'secondaryDns'), true)
  assert.equal(cleared.secondaryDns, null)
})

test('static addresses and gateways must be IPv4 in every mode', async () => {
  for (const profile of [staticConfig, fallbackConfig, { ...staticConfig, ...dhcpConfig }]) {
    for (const field of ['staticIpAddress', 'staticGateway']) {
      await assert.rejects(
        updateGatewayEthernetConfValidator.validate({
          ...profile,
          staticPrefixLength: 24,
          [field]: '2001:db8::1',
        }),
        (error) => error.messages?.some((message) => message.field === field) ?? false
      )
    }
  }
})

test('DNS addresses still accept IPv6', async () => {
  const profile = await updateGatewayEthernetConfValidator.validate({
    ...fallbackConfig,
    staticPrefixLength: 24,
    primaryDns: '2001:db8::53',
    secondaryDns: '2001:db8::54',
  })

  assert.equal(profile.primaryDns, '2001:db8::53')
  assert.equal(profile.secondaryDns, '2001:db8::54')
})
