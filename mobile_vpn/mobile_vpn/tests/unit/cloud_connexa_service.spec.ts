import { test } from '@japa/runner'
import CloudConnexaService from '#services/cloud_connexa_service'

test.group('CloudConnexa upstream errors', () => {
  test('captures a bounded, redacted upstream error body', async ({ assert }) => {
    const service = new CloudConnexaService() as unknown as {
      readSafeErrorBody(response: Response): Promise<unknown>
    }

    const body = await service.readSafeErrorBody(
      new Response(
        JSON.stringify({
          message: 'Invalid IP service configuration',
          details: { field: 'config.serviceTypes', client_secret: 'must-not-leak' },
        }),
        { status: 400 }
      )
    )

    assert.deepEqual(body, {
      message: 'Invalid IP service configuration',
      details: { field: 'config.serviceTypes', client_secret: '[REDACTED]' },
    })
  })

  test('keeps non-JSON upstream diagnostics bounded without exposing headers', async ({
    assert,
  }) => {
    const service = new CloudConnexaService() as unknown as {
      readSafeErrorBody(response: Response): Promise<unknown>
    }

    const body = await service.readSafeErrorBody(
      new Response('invalid service type', { status: 400 })
    )

    assert.equal(body, 'invalid service type')
  })
  test('reuses an existing exact management route without creating resources', async ({
    assert,
  }) => {
    const service = new CloudConnexaService() as any
    const calls: string[] = []
    service.request = async (method: string, path: string) => {
      calls.push(`${method} ${path}`)
      if (path === '/api/v1/networks/existing-network') {
        return { connectors: [{ id: 'existing-connector' }] }
      }
      return {
        content: [
          {
            id: 'existing-ip-service',
            type: 'SERVICE_DESTINATION',
            networkItemId: 'existing-network',
            routes: [{ subnet: '10.42.0.126/32' }],
          },
        ],
      }
    }
    const result = await service.createGatewayResources('gateway', '10.42.0.126')
    assert.deepEqual(result, {
      networkId: 'existing-network',
      connectorId: 'existing-connector',
      ipServiceId: 'existing-ip-service',
    })
    assert.deepEqual(calls, [
      'GET /api/v1/networks/ip-services?page=0&size=100',
      'GET /api/v1/networks/existing-network',
    ])
    assert.notInclude(calls, 'POST /api/v1/networks')
    assert.notInclude(calls, 'POST /api/v1/networks/ip-services')
  })

  test('paginates discovery before reusing a matching service', async ({ assert }) => {
    const service = new CloudConnexaService() as any
    const calls: string[] = []
    service.request = async (method: string, path: string) => {
      calls.push(`${method} ${path}`)
      if (path.includes('page=0'))
        return { content: Array.from({ length: 100 }, () => ({ type: 'OTHER' })), totalPages: 2 }
      if (path === '/api/v1/networks/network-2') {
        return { connectors: [{ id: 'connector-2' }] }
      }
      return {
        content: [
          {
            id: 'ip-2',
            type: 'SERVICE_DESTINATION',
            networkItemId: 'network-2',
            routes: [{ subnet: '10.42.0.126/32' }],
          },
        ],
      }
    }
    const result = await service.createGatewayResources('gateway', '10.42.0.126')
    assert.equal(result.networkId, 'network-2')
    assert.deepEqual(calls, [
      'GET /api/v1/networks/ip-services?page=0&size=100',
      'GET /api/v1/networks/ip-services?page=1&size=100',
      'GET /api/v1/networks/network-2',
    ])
  })

  test('creates normally when the matching service is invalid', async ({ assert }) => {
    const service = new CloudConnexaService() as any
    const methods: string[] = []
    service.request = async (method: string, path: string) => {
      methods.push(method)
      if (method === 'GET')
        return {
          content: [{ id: 'wrong', type: 'NETWORK_SERVICE', routes: [{ subnet: '10.42.0.126/32' }] }],
          totalPages: 1,
        }
      if (path === '/api/v1/networks')
        return { id: 'new-network', connectors: [{ id: 'new-connector' }] }
      if (path.includes('/ip-services?')) return { id: 'new-ip-service' }
      return {}
    }
    const result = await service.createGatewayResources('gateway', '10.42.0.126')
    assert.equal(result.networkId, 'new-network')
    assert.include(methods, 'POST')
  })
})
