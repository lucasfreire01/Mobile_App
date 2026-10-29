/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  health: {
    show: typeof routes['health.show']
  }
  auth: {
    accessTokens: {
      store: typeof routes['auth.access_tokens.store']
    }
  }
  profile: {
    profile: {
      show: typeof routes['profile.profile.show']
    }
    accessTokens: {
      destroy: typeof routes['profile.access_tokens.destroy']
    }
  }
  gateways: {
    index: typeof routes['gateways.index']
    store: typeof routes['gateways.store']
    show: typeof routes['gateways.show']
    update: typeof routes['gateways.update']
    destroy: typeof routes['gateways.destroy']
    vpnProfile: typeof routes['gateways.vpn_profile']
    networkOperations: typeof routes['gateways.network_operations']
    ethernet: {
      index: typeof routes['gateways.ethernet.index']
      store: typeof routes['gateways.ethernet.store']
      show: typeof routes['gateways.ethernet.show']
      update: typeof routes['gateways.ethernet.update']
    }
  }
  users: {
    store: typeof routes['users.store']
  }
  gatewaySshHostKeys: {
    rotate: typeof routes['gateway_ssh_host_keys.rotate']
    index: typeof routes['gateway_ssh_host_keys.index']
  }
  gatewaySecurityAlerts: {
    index: typeof routes['gateway_security_alerts.index']
    acknowledge: typeof routes['gateway_security_alerts.acknowledge']
  }
  gatewayEthernets: {
    hostname: typeof routes['gateway_ethernets.hostname']
    device: typeof routes['gateway_ethernets.device']
    apply: typeof routes['gateway_ethernets.apply']
  }
  queueHealths: {
    show: typeof routes['queue_healths.show']
  }
}
