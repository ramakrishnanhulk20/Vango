import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { stamps } from '../db/schema.js'
import { currentUser, ownedAddresses } from '../domain/auth.js'
import { claimByHash, progress } from '../domain/stamps.js'
import { firstIssue, type RouteDeps } from './context.js'

const claimBody = z.object({ hash: z.string().regex(/^[0-9a-fA-F]{64}$/, 'not a transaction hash') })

export function registerStampRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.post('/api/stamps/claim', { preHandler: deps.requireUser }, async (request, reply) => {
    const body = claimBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ error: firstIssue(body.error) })

    const user = currentUser(request)
    const result = await claimByHash(body.data.hash, {
      database: deps.database,
      fetch: deps.fetchTransaction,
    })

    if (!result.stamped) {
      request.log.info({ userId: user.id, hash: body.data.hash, reason: result.reason }, 'stamp refused')
      return reply.send({ result })
    }

    const [stamp] = await deps.database.select().from(stamps).where(eq(stamps.id, result.stampId)).limit(1)
    request.log.info(
      { userId: user.id, stampId: result.stampId, cardCode: result.cardCode },
      'stamp recorded',
    )

    // A customer can report any hash, including a stranger's. The stamp is still valid,
    // it just is not theirs, so no progress comes back with it.
    if (!stamp || !ownedAddresses(user).includes(stamp.senderAddress)) {
      return reply.send({ result })
    }

    return reply.send({ result, progress: await progress(stamp.cardId, user.id, deps.database) })
  })
}
