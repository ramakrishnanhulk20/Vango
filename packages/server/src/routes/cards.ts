import type { FastifyInstance } from 'fastify'
import { z, ZodError } from 'zod'
import { currentUser } from '../domain/auth.js'
import {
  cardByCode,
  cardSummaryById,
  createCard,
  MIN_STAMP_LUNA,
  type CreateCardInput,
} from '../domain/cards.js'
import { cards } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { isCardCode } from '../lib/code.js'
import { firstIssue, type RouteDeps } from './context.js'

/**
 * Strict on purpose: a body that names a receiving address is refused rather than quietly
 * ignored, so a caller written against the old shape hears about it instead of believing
 * the card pays into an address it named.
 */
const createBody = z.strictObject({
  name: z.string().trim().min(1).max(40),
  rewardKind: z.enum(['nth_free', 'cashback']),
  targetVisits: z.number().int().min(2).max(20).optional(),
  cashbackBps: z.number().int().min(1).max(2000).optional(),
  minLuna: z.number().int().min(MIN_STAMP_LUNA).optional(),
  rewardText: z.string().trim().min(1).max(60),
})

const codeParams = z.object({ code: z.string().min(1).max(16) })

const patchBody = z.object({ active: z.boolean() })

export function registerCardRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/api/cards', { preHandler: deps.requireUser }, async (request, reply) => {
    const body = createBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const merchant = currentUser(request)
    const common = {
      merchantUserId: merchant.id,
      name: body.data.name,
      rewardText: body.data.rewardText,
      ...(body.data.minLuna === undefined ? {} : { minLuna: body.data.minLuna }),
    }

    let input: CreateCardInput
    if (body.data.rewardKind === 'nth_free') {
      if (body.data.targetVisits === undefined) {
        return reply.code(400).send({ error: 'targetVisits is required for an nth_free card' })
      }
      input = { ...common, rewardKind: 'nth_free', targetVisits: body.data.targetVisits }
    } else {
      if (body.data.cashbackBps === undefined) {
        return reply.code(400).send({ error: 'cashbackBps is required for a cashback card' })
      }
      input = { ...common, rewardKind: 'cashback', cashbackBps: body.data.cashbackBps }
    }

    try {
      const card = await createCard(input, deps.database)
      const summary = await cardSummaryById(card.id, deps.database)
      request.log.info({ userId: merchant.id, cardCode: card.code }, 'card opened')
      return reply.code(201).send(summary)
    } catch (error) {
      if (error instanceof ZodError) return reply.code(400).send({ error: firstIssue(error) })
      throw error
    }
  })

  app.get('/api/cards/:code', async (request, reply) => {
    const params = codeParams.safeParse(request.params)
    if (!params.success || !isCardCode(params.data.code)) {
      return reply.code(404).send({ error: 'unknown card' })
    }

    const card = await cardByCode(params.data.code, deps.database)
    if (!card) return reply.code(404).send({ error: 'unknown card' })

    return reply.send({
      code: card.code,
      name: card.name,
      rewardKind: card.rewardKind,
      rewardText: card.rewardText,
      targetVisits: card.targetVisits,
      cashbackBps: card.cashbackBps,
      minLuna: card.minLuna,
      receivingAddress: card.receivingAddress,
      memo: `vango:${card.code}`,
      active: card.active,
    })
  })

  app.patch('/api/cards/:code', { preHandler: deps.requireUser }, async (request, reply) => {
    const params = codeParams.safeParse(request.params)
    if (!params.success || !isCardCode(params.data.code)) {
      return reply.code(404).send({ error: 'unknown card' })
    }

    const body = patchBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const merchant = currentUser(request)
    const card = await cardByCode(params.data.code, deps.database)
    if (!card) return reply.code(404).send({ error: 'unknown card' })
    if (card.merchantUserId !== merchant.id) {
      request.log.warn({ ip: request.ip, userId: merchant.id, cardCode: card.code }, 'card change refused')
      return reply.code(403).send({ error: 'this card belongs to another merchant' })
    }

    await deps.database.update(cards).set({ active: body.data.active }).where(eq(cards.id, card.id))
    request.log.info({ userId: merchant.id, cardCode: card.code, active: body.data.active }, 'card changed')

    return reply.send(await cardSummaryById(card.id, deps.database))
  })
}
