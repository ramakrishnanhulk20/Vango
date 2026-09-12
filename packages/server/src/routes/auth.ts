import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { currentUser, login } from '../domain/auth.js'
import { cardSummaries } from '../domain/cards.js'
import { issueChallenge } from '../domain/challenges.js'
import { heldCards } from '../domain/wallet.js'
import { firstIssue, publicUser, type RouteDeps } from './context.js'

const challengeBody = z.looseObject({}).nullish()

const verifyBody = z.object({
  message: z.string().min(1).max(200),
  publicKey: z.string().min(1).max(200),
  signature: z.string().min(1).max(300),
  visibleAddress: z.string().min(1).max(60),
  remoteAddress: z.string().max(60).optional(),
  language: z.string().max(20).optional(),
  fiat: z.string().max(20).optional(),
})

export function registerAuthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const limited = { config: { rateLimit: deps.limits.auth } }

  app.post('/api/auth/challenge', limited, async (request, reply) => {
    const body = challengeBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const challenge = await issueChallenge('login', null, deps.database)
    return reply.send({
      message: challenge.message,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    })
  })

  app.post('/api/auth/verify', limited, async (request, reply) => {
    const body = verifyBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const result = await login(body.data, deps.database)

    if (!result.ok) {
      request.log.warn({ ip: request.ip, reason: result.error }, 'login refused')
      return reply.code(result.status).send({ error: result.error })
    }

    request.log.info(
      { userId: result.user.id, attachedStamps: result.attachedStamps },
      'wallet signed in',
    )
    return reply.send({ token: result.token, user: publicUser(result.user) })
  })

  app.get('/api/me', { preHandler: deps.requireUser }, async (request, reply) => {
    const user = currentUser(request)

    return reply.send({
      user: publicUser(user),
      owned: await cardSummaries(user.id, deps.database),
      held: await heldCards(user.id, deps.database),
    })
  })
}
