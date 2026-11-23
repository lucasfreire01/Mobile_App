import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

const MAX_REQUEST_BYTES = 1 * 1024 * 1024

export default class RequestPayloadGuardMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const request = ctx.request.request
    const contentLength = Number(request.headers['content-length'] ?? 0)
    const encoding = String(request.headers['content-encoding'] ?? '').toLowerCase()
    const contentType = String(request.headers['content-type'] ?? '').toLowerCase()
    const limitedBody = contentType.includes('application/json') || contentType.includes('application/x-www-form-urlencoded')

    if (limitedBody && Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return ctx.response.status(413).send({ message: 'Payload too large.' })
    }
    if (encoding && encoding !== 'identity') {
      return ctx.response.status(415).send({ message: 'Compressed request payloads are not accepted.' })
    }
    return next()
  }
}
