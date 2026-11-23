import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import { controllers } from '#generated/controllers'
import './routes/bridge_pairings.js'
import {
  adminMutationThrottle,
  enrollmentThrottle,
  ethernetApplyThrottle,
  gatewayProvisioningThrottle,
  gatewaySshReadThrottle,
  healthThrottle,
  loginThrottle,
  profileThrottle,
} from '#start/limiter'

router.get('/', () => {
  return { hello: 'world' }
})
router.get('/health', [controllers.Health, 'show']).use(healthThrottle)
router.post('gateways/:id/enrollment/renew', [controllers.Gateways, 'renewEnrollment'])
  .use([middleware.auth(), middleware.admin(), adminMutationThrottle])
  .prefix('/api/v1')

router
  .group(() => {
    router
      .post('gateways/enrollment/claim', [controllers.Gateways, 'enroll'])
      .use(enrollmentThrottle)
    router
      .post('gateways/enrollment/complete', [controllers.Gateways, 'completeEnrollment'])
      .use(enrollmentThrottle)

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
        router.get('gateways/discover', [controllers.Gateways, 'discover'])
        router
          .post('gateways/attach', [controllers.Gateways, 'attach'])
          .use(gatewayProvisioningThrottle)
        router
          .resource('gateways', controllers.Gateways)
          .apiOnly()
          .use(['store', 'destroy'], gatewayProvisioningThrottle)
        router.post('users', [() => import('#controllers/users_controller'), 'store'])

        router
          .post('gateways/:id/ssh-host-key/rotate', [controllers.GatewaySshHostKeys, 'rotate'])
          .use(adminMutationThrottle)

        router.get('gateways/:id/ssh-host-key/rotations', [controllers.GatewaySshHostKeys, 'index'])

        router.get('gateways/:id/security-alerts', [controllers.GatewaySecurityAlerts, 'index'])

        router
          .post('gateways/:id/security-alerts/:alertId/acknowledge', [
            controllers.GatewaySecurityAlerts,
            'acknowledge',
          ])
          .use(adminMutationThrottle)

        router
          .get('gateways/:id/ethernet/hostname', [controllers.GatewayEthernets, 'hostname'])
          .use(gatewaySshReadThrottle)

        router
          .get('gateways/:id/vpn-profile', [controllers.Gateways, 'vpnProfile'])
          .use(profileThrottle)

        router.get('gateways/:id/network-operations', [controllers.Gateways, 'networkOperations'])

        router
          .get('gateways/:id/ethernet/device', [controllers.GatewayEthernets, 'device'])
          .use(gatewaySshReadThrottle)

        router
          .post('gateways/:id/ethernet/apply', [controllers.GatewayEthernets, 'apply'])
          .use(ethernetApplyThrottle)

        router
          .resource('gateways.ethernet', controllers.GatewayEthernets)
          .apiOnly()
          .only(['index', 'store', 'show', 'update'])
        router.get('health/queue', [controllers.QueueHealths, 'show']).use(healthThrottle)
      })
      .use([middleware.auth(), middleware.admin(), adminMutationThrottle])
  })
  .prefix('/api/v1')
