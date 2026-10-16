/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  auth: {
    newAccount: {
      store: typeof routes['auth.new_account.store']
    }
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
  }
  gatewayEthernets: {
    show: typeof routes['gateway_ethernets.show']
    update: typeof routes['gateway_ethernets.update']
    hostname: typeof routes['gateway_ethernets.hostname']
  }
}
