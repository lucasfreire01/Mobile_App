import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import { loginThrottle } from '#start/limiter'

router.get('/', () => {
  return { hello: 'world' }
})
router.get('/health', [controllers.Health, 'show'])

router
  .group(() => {
    router
      .group(() => {
        router.post('login', [controllers.AccessTokens, 'store']).use(loginThrottle)
      })
      .prefix('auth')
      .as('auth')

    router
      .group(() => {
        router.get('profile', [controllers.Profile, 'show'])
        router.post('logout', [controllers.AccessTokens, 'destroy'])
      })
      .prefix('account')
      .as('profile')
      .use(middleware.auth())

    router
      .group(() => {
        router.resource('gateways', controllers.Gateways).apiOnly()
        router.post('users', [() => import('#controllers/users_controller'), 'store'])

        router.post('gateways/:id/ssh-host-key/rotate', [controllers.GatewaySshHostKeys, 'rotate'])

        router.get('gateways/:id/ssh-host-key/rotations', [controllers.GatewaySshHostKeys, 'index'])

        router.get('gateways/:id/security-alerts', [controllers.GatewaySecurityAlerts, 'index'])

        router.post('gateways/:id/security-alerts/:alertId/acknowledge', [
          controllers.GatewaySecurityAlerts,
          'acknowledge',
        ])

        router.get('gateways/:id/ethernet/hostname', [controllers.GatewayEthernets, 'hostname'])

        router.get('gateways/:id/vpn-profile', [controllers.Gateways, 'vpnProfile'])

        router.get('gateways/:id/network-operations', [controllers.Gateways, 'networkOperations'])

        router.get('gateways/:id/ethernet/device', [controllers.GatewayEthernets, 'device'])

        router.post('gateways/:id/ethernet/apply', [controllers.GatewayEthernets, 'apply'])

        router
          .resource('gateways.ethernet', controllers.GatewayEthernets)
          .apiOnly()
          .only(['index', 'store', 'show', 'update'])
        router.get('health/queue', [controllers.QueueHealths, 'show'])
      })
      .use([middleware.auth(), middleware.admin()])
  })
  .prefix('/api/v1')
