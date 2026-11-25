import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'
import {
  adminMutationThrottle,
  enrollmentThrottle,
  gatewayProvisioningThrottle,
  healthThrottle,
} from '#start/limiter'

const bridgePairings = () => import('#controllers/bridge_pairings_controller')
router.post('gateway-bridges/package', [bridgePairings, 'download']).use(gatewayProvisioningThrottle).prefix('/api/v1')

router
  .group(() => {
    router
      .post('gateway-bridges/:id/activate', [bridgePairings, 'activate'])
      .use(enrollmentThrottle)
    router.post('gateway-bridge-sessions', [bridgePairings, 'store']).use(enrollmentThrottle)
    router.post('gateway-bridge-sessions/:id/poll', [bridgePairings, 'poll']).use(healthThrottle)
    router
      .post('gateway-bridge-sessions/:id/result', [bridgePairings, 'acknowledge'])
      .use(enrollmentThrottle)
  })
  .prefix('/api/v1')

router
  .group(() => {
    router.post('gateway-bridges', [bridgePairings, 'provision']).use(gatewayProvisioningThrottle)
  })
  .use(middleware.auth())
  .prefix('/api/v1')

router
  .group(() => {
    router.delete('gateway-bridges/:id', [bridgePairings, 'revoke'])
    router.post('gateway-bridge-sessions/:id/approve', [bridgePairings, 'approve'])
    router.get('gateway-bridge-sessions/:id', [bridgePairings, 'show'])
  })
  .use([middleware.auth(), middleware.admin(), adminMutationThrottle])
  .prefix('/api/v1')
