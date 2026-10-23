import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/', () => {
  return { hello: 'world' }
})
router.get('/health', [controllers.Health, 'show'])

router
  .group(() => {
    router
      .group(() => {
        router.post('signup', [controllers.NewAccount, 'store'])
        router.post('login', [controllers.AccessTokens, 'store'])
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

    router.resource('gateways', controllers.Gateways).apiOnly().use('*', middleware.auth())

    router
      .get('gateways/:id/ethernet/hostname', [controllers.GatewayEthernets, 'hostname'])
      .use(middleware.auth())

    router
      .get('gateways/:id/vpn-profile', [controllers.Gateways, 'vpnProfile'])
      .use(middleware.auth())

    router
      .get('gateways/:id/network-operations', [controllers.Gateways, 'networkOperations'])
      .use(middleware.auth())

    router
      .get('gateways/:id/ethernet/device', [controllers.GatewayEthernets, 'device'])
      .use(middleware.auth())

    router
      .post('gateways/:id/ethernet/apply', [controllers.GatewayEthernets, 'apply'])
      .use(middleware.auth())

    router
      .resource('gateways.ethernet', controllers.GatewayEthernets)
      .apiOnly()
      .only(['index', 'store', 'show', 'update'])
      .use('*', middleware.auth())
    router.get('health/queue', [controllers.QueueHealths, 'show']).use(middleware.auth())
  })
  .prefix('/api/v1')
