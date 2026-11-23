/*
|--------------------------------------------------------------------------
| Define HTTP limiters
|--------------------------------------------------------------------------
|
| The "limiter.define" method creates an HTTP middleware to apply rate
| limits on a route or a group of routes. Feel free to define as many
| throttle middleware as needed.
|
*/

import limiter from '@adonisjs/limiter/services/main'

export const loginThrottle = limiter.define('login', () => {
  return limiter.allowRequests(10).every('1 minute')
})

export const enrollmentThrottle = limiter.define('enrollment', () => {
  return limiter.allowRequests(10).every('1 minute')
})

export const profileThrottle = limiter.define('vpn-profile', () => {
  return limiter.allowRequests(6).every('1 minute')
})

export const adminMutationThrottle = limiter.define('admin-mutation', () => {
  return limiter.allowRequests(30).every('1 minute')
})

export const gatewayProvisioningThrottle = limiter.define('gateway-provisioning', () => {
  return limiter.allowRequests(10).every('1 minute')
})

export const gatewaySshReadThrottle = limiter.define('gateway-ssh-read', () => {
  return limiter.allowRequests(5).every('1 minute')
})

export const ethernetApplyThrottle = limiter.define('ethernet-apply', () => {
  return limiter.allowRequests(3).every('1 minute')
})

export const healthThrottle = limiter.define('health', () => {
  return limiter.allowRequests(30).every('1 minute')
})
