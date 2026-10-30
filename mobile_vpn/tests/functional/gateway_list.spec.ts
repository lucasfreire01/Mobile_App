import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import Gateway from '#models/gateway'
import User from '#models/user'

type GatewayListResponse = {
  gatewaysList: { id: number }[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    previousPageUrl: string | null
    firstPageUrl: string
  }
  summary: { total: number; online: number; offline: number }
}

const listBody = (response: { body(): unknown }) => response.body() as GatewayListResponse

test.group('Paginated gateway list', (group) => {
  group.each.setup(async () => {
    await Gateway.query().delete()
    await db.from('auth_access_tokens').delete()
    await User.query().delete()
  })

  async function authorization() {
    const user = await User.create({
      email: 'gateway-list@example.test',
      password: 'isolated-list-test-password',
      isAdmin: true,
    })
    const token = await User.accessTokens.create(user)
    return `Bearer ${token.value!.release()}`
  }

  async function createGateways(count: number) {
    return Gateway.createMany(
      Array.from({ length: count }, (_, index) => ({
        name: `gateway-${String(index + 1).padStart(2, '0')}`,
        managementIpAddress: `10.42.0.${index + 1}`,
        status: index % 2 === 0 ? 'online' : 'offline',
      }))
    )
  }

  test('defaults to 20 ordered records and returns global counts on subsequent pages', async ({
    client,
    assert,
  }) => {
    const auth = await authorization()
    const gateways = await createGateways(23)
    const first = await client.get('/api/v1/gateways').header('authorization', auth)
    first.assertStatus(200)
    assert.deepEqual(
      listBody(first).gatewaysList.map((g: { id: number }) => g.id),
      gateways.slice(0, 20).map((g) => g.id)
    )
    assert.equal(listBody(first).meta.total, 23)
    assert.equal(listBody(first).meta.perPage, 20)
    assert.equal(listBody(first).meta.lastPage, 2)
    assert.deepEqual(listBody(first).summary, { total: 23, online: 12, offline: 11 })

    const second = await client
      .get('/api/v1/gateways?page=2&limit=20')
      .header('authorization', auth)
    second.assertStatus(200)
    assert.deepEqual(
      listBody(second).gatewaysList.map((g: { id: number }) => g.id),
      gateways.slice(20).map((g) => g.id)
    )
    assert.equal(listBody(second).meta.currentPage, 2)
    assert.equal(listBody(second).meta.previousPageUrl, '/api/v1/gateways?limit=20&page=1')
    assert.deepEqual(listBody(second).summary, listBody(first).summary)
  })

  test('searches the entire inventory and combines status with search before pagination', async ({
    client,
    assert,
  }) => {
    const auth = await authorization()
    const gateways = await createGateways(23)
    const byName = await client
      .get('/api/v1/gateways?q=GATEWAY-23&status=online&limit=1')
      .header('authorization', auth)
    byName.assertStatus(200)
    assert.deepEqual(
      listBody(byName).gatewaysList.map((g: { id: number }) => g.id),
      [gateways[22].id]
    )
    assert.equal(listBody(byName).meta.total, 1)
    assert.include(listBody(byName).meta.firstPageUrl, 'q=GATEWAY-23')
    assert.include(listBody(byName).meta.firstPageUrl, 'status=online')
    assert.deepEqual(listBody(byName).summary, { total: 23, online: 12, offline: 11 })

    const byIp = await client.get('/api/v1/gateways?q=10.42.0.23').header('authorization', auth)
    assert.equal(listBody(byIp).gatewaysList[0].id, gateways[22].id)
    const offline = await client
      .get('/api/v1/gateways?status=offline&page=2&limit=2')
      .header('authorization', auth)
    assert.deepEqual(
      listBody(offline).gatewaysList.map((g: { id: number }) => g.id),
      [gateways[5].id, gateways[7].id]
    )
    assert.equal(listBody(offline).meta.total, 11)
    const mismatch = await client
      .get('/api/v1/gateways?q=gateway-23&status=offline')
      .header('authorization', auth)
    assert.deepEqual(listBody(mismatch).gatewaysList, [])
  })

  test('searches WAN addresses and treats SQL wildcard characters as literal text', async ({
    client,
    assert,
  }) => {
    const auth = await authorization()
    const expected = await Gateway.create({
      name: 'site_100%',
      managementIpAddress: '10.42.0.25',
      wanIpAddress: '192.0.2.123',
      status: 'online',
    })
    await Gateway.create({
      name: 'siteX100x',
      managementIpAddress: '10.42.0.26',
      status: 'offline',
    })
    for (const q of ['192.0.2.123', 'site_100%', '%', '_']) {
      const response = await client
        .get(`/api/v1/gateways?q=${encodeURIComponent(q)}`)
        .header('authorization', auth)
      response.assertStatus(200)
      assert.deepEqual(
        listBody(response).gatewaysList.map((g: { id: number }) => g.id),
        [expected.id]
      )
    }
  })

  test('bounds page sizes, normalizes invalid input and supports empty and out-of-range pages', async ({
    client,
    assert,
  }) => {
    const auth = await authorization()
    const empty = await client.get('/api/v1/gateways').header('authorization', auth)
    assert.deepEqual(listBody(empty).gatewaysList, [])
    assert.deepEqual(listBody(empty).summary, { total: 0, online: 0, offline: 0 })
    assert.equal(listBody(empty).meta.lastPage, 1)
    await createGateways(1)
    for (const params of ['page=-1&limit=0', 'page=oops&limit=2.5']) {
      const response = await client.get(`/api/v1/gateways?${params}`).header('authorization', auth)
      response.assertStatus(200)
      assert.equal(listBody(response).meta.currentPage, 1)
      assert.equal(listBody(response).meta.perPage, 20)
    }
    const capped = await client
      .get('/api/v1/gateways?limit=100000&status=unexpected')
      .header('authorization', auth)
    assert.equal(listBody(capped).meta.perPage, 100)
    assert.equal(listBody(capped).gatewaysList.length, 1)
    const beyond = await client.get('/api/v1/gateways?page=99').header('authorization', auth)
    assert.deepEqual(listBody(beyond).gatewaysList, [])
    assert.equal(listBody(beyond).meta.total, 1)
  })
})
