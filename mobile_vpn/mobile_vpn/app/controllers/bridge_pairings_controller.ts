import type { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import BridgePairingService from '#services/bridge_pairing_service'
import BridgePackageService from '#services/bridge_package_service'
import env from '#start/env'
import { createReadStream } from 'node:fs'

const mac = () => vine.string().regex(/^(?:[a-f0-9]{2}:){5}[a-f0-9]{2}$/i)
const sessionId = vine.compile(vine.object({ id: vine.string().uuid() }))
const create = vine.compile(
  vine.object({
    bridgeId: vine.string().uuid(),
    gatewayMacs: vine.array(mac()).minLength(1).maxLength(64),
  })
)
const provision = vine.compile(
  vine.object({
    bridgeId: vine.string().uuid(),
    publicKey: vine.string().trim().minLength(80).maxLength(256),
  })
)
const approve = vine.compile(
  vine.object({
    gatewayId: vine.number().positive().withoutDecimals(),
    gatewayMac: mac(),
    enrollmentCode: vine.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
)
const proof = vine.compile(vine.object({ token: vine.string().regex(/^[A-Za-z0-9_-]{43}$/) }))
const activation = vine.compile(
  vine.object({ bridgeToken: vine.string().regex(/^[A-Za-z0-9_-]{43}$/) })
)
const signedActivation = vine.compile(
  vine.object({
    bridgeToken: vine.string().regex(/^[A-Za-z0-9_-]{43}$/),
    proof: vine.string().regex(/^[A-Za-z0-9_-]{86}$/),
  })
)
const receipt = vine.compile(vine.object({ outcome: vine.enum(['submitted', 'failed']) }))
const download = vine.compile(vine.object({
  platform: vine.enum(['linux-x64', 'windows-x64']),
  bridgeId: vine.string().uuid().optional(),
  installationToken: vine.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
}))

export default class BridgePairingsController {
  private service = new BridgePairingService()

  async download({ auth, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const input = await request.validateUsing(download)
    const artifact = input.bridgeId && input.installationToken
      ? await new BridgePackageService().createFromInstallationGrant(input.bridgeId, input.installationToken, input.platform, env.get('APP_URL'))
      : await new BridgePackageService().create(auth.getUserOrFail().id, input.platform, env.get('APP_URL'))
    if (response.response.destroyed) {
      await artifact.cleanup(true)
      return
    }
    const stream = createReadStream(artifact.path)
    let failed = false
    const timeout = setTimeout(() => {
      failed = true
      stream.destroy(new Error('Package transfer timed out'))
    }, 120_000)
    timeout.unref()
    response.onFinish((error, raw) => {
      clearTimeout(timeout)
      stream.destroy()
      void artifact.cleanup(failed || Boolean(error) || !raw.writableFinished).catch(() => {})
    })
    const extension = 'tar.gz'
    response.header('Content-Type', 'application/gzip')
    response.header(
      'Content-Disposition',
      `attachment; filename="saganexus-ponte-linux-x64.${extension}"`
    )
    response.header('Content-Length', String(artifact.bytes))
    response.header('X-Bridge-Installation-Expires-At', String(artifact.expiresAt))
    return response.stream(stream, () => {
      failed = true
      return ['Não foi possível transferir o pacote da ponte.', 503]
    })
  }

  async provision({ auth, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const userId = auth.getUserOrFail().id
    const body = request.all()
    if (!('bridgeId' in body) && !('publicKey' in body)) {
      return response.created(await this.service.provisionBridge(userId))
    }
    const input = await request.validateUsing(provision)
    return response.created(
      await this.service.registerBridge(userId, input.bridgeId, input.publicKey)
    )
  }

  async activate({ params, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    if (request.hasBody() && 'proof' in request.all()) {
      const { bridgeToken, proof: activationProof } = await request.validateUsing(signedActivation)
      return response.created(await this.service.activateBridge(id, '', bridgeToken, activationProof))
    }
    const { token } = await proof.validate({
      token: request.header('authorization')?.replace(/^Bearer /, ''),
    })
    const { bridgeToken } = await request.validateUsing(activation)
    return response.created(await this.service.activateBridge(id, token, bridgeToken))
  }

  async revoke({ auth, params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    await this.service.revokeBridge(id, auth.getUserOrFail().id)
    return response.noContent()
  }

  async store({ request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const input = await request.validateUsing(create)
    const { token } = await proof.validate({
      token: request.header('authorization')?.replace(/^Bearer /, ''),
    })
    return response.created(
      await this.service.create(input.gatewayMacs, { bridgeId: input.bridgeId, token })
    )
  }

  async approve({ auth, params, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    const input = await request.validateUsing(approve)
    const user = auth.getUserOrFail()
    return response.ok(await this.service.authorize(id, user.id, input, user.isAdmin))
  }

  async poll({ params, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    const { token } = await proof.validate({
      token: request.header('authorization')?.replace(/^Bearer /, ''),
    })
    return response.ok(await this.service.poll(id, token))
  }

  async acknowledge({ params, request, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    const { token } = await proof.validate({
      token: request.header('authorization')?.replace(/^Bearer /, ''),
    })
    const { outcome } = await request.validateUsing(receipt)
    return response.ok(await this.service.acknowledge(id, token, outcome))
  }

  async show({ auth, params, response }: HttpContext) {
    response.header('Cache-Control', 'no-store')
    const { id } = await sessionId.validate({ id: params.id })
    const user = auth.getUserOrFail()
    return response.ok(await this.service.status(id, user.id, user.isAdmin))
  }
}
