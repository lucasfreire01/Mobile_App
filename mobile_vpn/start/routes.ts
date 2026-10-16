import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'

router.get('/', () => {
  return { hello: 'world' }
})

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
      .get('gateways/:id/ethernet', [controllers.GatewayEthernets, 'show'])
      .use(middleware.auth())

    router
      .put('gateways/:id/ethernet', [controllers.GatewayEthernets, 'update'])
      .use(middleware.auth())
    router
      .get('gateways/:id/ethernet/hostname', [controllers.GatewayEthernets, 'hostname'])
      .use(middleware.auth())
  })
  .prefix('/api/v1')
