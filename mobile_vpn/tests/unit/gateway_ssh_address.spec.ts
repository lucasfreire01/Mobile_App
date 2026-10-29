import { test } from '@japa/runner'
import Gateway from '#models/gateway'
import GatewaySshService from '#services/gateway_ssh_service'
import env from '#start/env'
import { ensureAllowedSshAddress } from '#services/gateway_ssh_address_policy'

test.group('Gateway SSH destination restrictions', (group) => {
  group.each.setup(() => {
    const previous = env.get('GATEWAY_SSH_ALLOWED_CIDRS')
    env.set('GATEWAY_SSH_ALLOWED_CIDRS', '10.42.0.0/24,192.168.11.0/24')
    return () => {
      env.set('GATEWAY_SSH_ALLOWED_CIDRS', previous)
      if (previous === undefined) delete process.env.GATEWAY_SSH_ALLOWED_CIDRS
    }
  })
  test('accepts only literal addresses inside configured management and LAN subnets', ({
    assert,
  }) => {
    for (const address of ['10.42.0.1', '10.42.0.254', '192.168.11.200']) {
      assert.equal(ensureAllowedSshAddress(address), address)
    }
    for (const address of ['10.42.1.1', '192.168.12.1', '::ffff:127.0.0.1']) {
      assert.throws(() => ensureAllowedSshAddress(address), /not allowed/)
    }
  })

  test('fails closed when the allowlist is invalid', ({ assert }) => {
    for (const value of ['', '10.42.0.0/99', '10.42.0.0/', '10.42.0.0/24/extra', 'localhost/24']) {
      env.set('GATEWAY_SSH_ALLOWED_CIDRS', value)
      assert.throws(() => ensureAllowedSshAddress('10.42.0.1'), /Invalid gateway SSH/)
    }
  })
  for (const address of [
    '127.0.0.1',
    '169.254.169.254',
    '8.8.8.8',
    'localhost',
    '::1',
    '10.42.0.1.evil.test',
  ]) {
    test(`rejects untrusted destination ${address} before reading the private key`, async ({
      assert,
    }) => {
      const service = new GatewaySshService()
      const gateway = new Gateway()
      gateway.managementIpAddress = address
      assert.throws(() => service.ensureConnectionAddress(gateway), /not allowed/)
      await assert.rejects(() => service.connectToAddress(address, 'SHA256:test'), /not allowed/)
    })
  }
})
