import { test } from '@japa/runner'
import { Exception } from '@adonisjs/core/exceptions'
import {
  buildDhcpFallbackCommand,
  DHCP_FALLBACK_COOLDOWN_SECONDS,
  DHCP_FALLBACK_FAILURE_THRESHOLD,
  DHCP_FALLBACK_SCRIPT,
} from '#services/gateway_ssh_service'

test.group('DHCP fallback command', () => {
  test('installs an enabled static recovery profile before DHCP is restarted', ({ assert }) => {
    const command = buildDhcpFallbackCommand({
      ipAddress: '10.42.0.126',
      prefixLength: 24,
      gateway: '10.42.0.1',
      primaryDns: '10.42.0.1',
      secondaryDns: '1.1.1.1',
    })

    assert.include(command, "uci set gateway_fallback.wan.enabled='1'")
    assert.include(command, "uci set gateway_fallback.wan.ipaddr='10.42.0.126'")
    assert.include(command, "uci set gateway_fallback.wan.netmask='255.255.255.0'")
    assert.include(command, "uci set gateway_fallback.wan.gateway='10.42.0.1'")
    assert.include(command, "uci set gateway_fallback.wan.primary_dns='10.42.0.1'")
    assert.include(command, "uci set gateway_fallback.wan.secondary_dns='1.1.1.1'")
    assert.include(
      command,
      `uci set gateway_fallback.wan.failure_threshold='${DHCP_FALLBACK_FAILURE_THRESHOLD}'`
    )
    assert.include(
      command,
      `uci set gateway_fallback.wan.cooldown_seconds='${DHCP_FALLBACK_COOLDOWN_SECONDS}'`
    )
    assert.include(command, 'gateway_dhcp_fallback.sh >/dev/null 2>&1')
  })

  test('does not configure a secondary DNS when it is absent', ({ assert }) => {
    const command = buildDhcpFallbackCommand({
      ipAddress: '10.42.0.126',
      prefixLength: 24,
      gateway: '10.42.0.1',
      primaryDns: '10.42.0.1',
      secondaryDns: null,
    })

    assert.notInclude(command, 'gateway_fallback.wan.secondary_dns')
  })

  test('writes a script that needs consecutive failures and observes cooldown', ({ assert }) => {
    assert.include(DHCP_FALLBACK_SCRIPT, 'failures=$((failures + 1))')
    assert.include(DHCP_FALLBACK_SCRIPT, 'if [ "$failures" -lt "$threshold" ]; then')
    assert.include(DHCP_FALLBACK_SCRIPT, 'DHCP address missing ($failures/$threshold)')
    assert.include(DHCP_FALLBACK_SCRIPT, 'if [ $((now - last_switch)) -lt "$cooldown" ]; then')
    assert.include(DHCP_FALLBACK_SCRIPT, 'DHCP fallback is in cooldown')
    assert.include(DHCP_FALLBACK_SCRIPT, 'uci set network.wan.proto="static"')
  })

  test('rejects an invalid prefix before any SSH command can be executed', ({ assert }) => {
    let caught: unknown

    try {
      buildDhcpFallbackCommand({
        ipAddress: '10.42.0.126',
        prefixLength: 33,
        gateway: '10.42.0.1',
        primaryDns: '10.42.0.1',
      })
    } catch (error) {
      caught = error
    }

    assert.instanceOf(caught, Exception)
    assert.equal((caught as Exception).code, 'E_GATEWAY_STATIC_PREFIX_INVALID')
  })
})
