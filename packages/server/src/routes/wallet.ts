import type { FastifyInstance } from 'fastify'
import { currentUser } from '../domain/auth.js'
import { heldCards } from '../domain/wallet.js'
import type { RouteDeps } from './context.js'

export function registerWalletRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/api/wallet', { preHandler: deps.requireUser }, async (request, reply) => {
    const user = currentUser(request)
    return reply.send({ held: await heldCards(user.id, deps.database) })
  })
}
