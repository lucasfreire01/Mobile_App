import app from '@adonisjs/core/services/app'
import { resolveVpnProvider } from '#services/vpn/registry'

// Validate the selected adapter and its configuration at boot, without contacting the VPN API.
if (app.getEnvironment() !== 'console') {
  await resolveVpnProvider()
}
