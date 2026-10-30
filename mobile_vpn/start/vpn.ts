import { resolveVpnProvider } from '#services/vpn/registry'

// Validate the selected adapter and its configuration at boot, without contacting the VPN API.
await resolveVpnProvider()
