import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { currentUser } from '../domain/auth.js'
import {
  confirmRedemption,
  findRedemption,
  settleCashback,
  signRedemption,
  startRedemption,
  viewRedemption,
} from '../domain/redemptions.js'
import { firstIssue, type RouteDeps } from './context.js'

const startBody = z.object({ code: z.string().min(1).max(16) })

const signBody = z.object({
  message: z.string().min(1).max(200),
  publicKey: z.string().min(1).max(200),
  signature: z.string().min(1).max(300),
})

const handleParams = z.object({ token: z.string().min(6).max(120) })

const paidBody = z.object({ hash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'not a transaction hash') })

export function registerRedeemRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const limited = { preHandler: deps.requireUser, config: { rateLimit: deps.limits.redeem } }

  app.post('/api/redeem/start', limited, async (request, reply) => {
    const body = startBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const user = currentUser(request)
    const result = await startRedemption(user, body.data.code, { database: deps.database })

    if (!result.ok) {
      const payload = result.progress ? { error: result.error, progress: result.progress } : { error: result.error }
      return reply.code(result.status).send(payload)
    }

    return reply.send({
      message: result.message,
      nonce: result.nonce,
      expiresAt: result.expiresAt,
      reward: result.reward,
    })
  })

  app.post('/api/redeem/sign', limited, async (request, reply) => {
    const body = signBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const user = currentUser(request)
    const result = await signRedemption(user, body.data, { database: deps.database })

    if (!result.ok) {
      request.log.warn({ ip: request.ip, userId: user.id, reason: result.error }, 'redemption refused')
      const payload = result.progress ? { error: result.error, progress: result.progress } : { error: result.error }
      return reply.code(result.status).send(payload)
    }

    request.log.info({ userId: user.id, redemptionId: result.id }, 'redemption opened')

    return reply.send({
      token: result.token,
      code6: result.code6,
      expiresAt: result.expiresAt,
      reward: result.reward,
    })
  })

  app.get('/api/redeem/:token', limited, async (request, reply) => {
    const params = handleParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: firstIssue(params.error) })

    const merchant = currentUser(request)
    const found = await findRedemption(merchant.id, params.data.token, { database: deps.database })
    if (!found) {
      request.log.warn({ ip: request.ip, userId: merchant.id }, 'redemption lookup refused')
      return reply.code(404).send({ error: 'reward not found' })
    }

    return reply.send(viewRedemption(found))
  })

  app.post('/api/redeem/:token/confirm', limited, async (request, reply) => {
    const params = handleParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: firstIssue(params.error) })

    const merchant = currentUser(request)
    const result = await confirmRedemption(merchant.id, params.data.token, { database: deps.database })

    if (!result.ok) {
      request.log.warn({ ip: request.ip, userId: merchant.id, reason: result.error }, 'confirm refused')
      const payload = result.progress ? { error: result.error, progress: result.progress } : { error: result.error }
      return reply.code(result.status).send(payload)
    }

    request.log.info(
      { userId: merchant.id, redemptionId: result.id, amountLuna: result.amountLuna ?? 0 },
      'redemption confirmed',
    )

    if (result.payTo === undefined) return reply.send({ status: result.status })

    return reply.send({
      status: result.status,
      payTo: result.payTo,
      amountLuna: result.amountLuna,
      memo: result.memo,
    })
  })

  app.post('/api/redeem/:token/paid', limited, async (request, reply) => {
    const params = handleParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: firstIssue(params.error) })

    const body = paidBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const merchant = currentUser(request)
    const result = await settleCashback(merchant.id, params.data.token, body.data.hash, {
      database: deps.database,
      fetch: deps.fetchTransaction,
    })

    if (!result.ok) {
      request.log.warn({ ip: request.ip, userId: merchant.id, reason: result.error }, 'cashback refused')
      return reply.code(result.status).send({ error: result.error })
    }

    request.log.info({ userId: merchant.id, cashbackTxHash: result.cashbackTxHash }, 'cashback settled')

    return reply.send({ status: result.status, cashbackTxHash: result.cashbackTxHash })
  })
}
