import type { preHandlerAsyncHookHandler } from 'fastify'
import type { z } from 'zod'
import type { Db } from '../db/client.js'
import type { User } from '../db/schema.js'
import type { fetchTransaction } from '../nimiq/rpc.js'

export type RateLimit = { max: number; timeWindow: string }

/** Everything a route group needs, handed in so a test can drive it with its own database. */
export type RouteDeps = {
  database: Db
  requireUser: preHandlerAsyncHookHandler
  fetchTransaction: typeof fetchTransaction
  limits: { auth: RateLimit; redeem: RateLimit }
}

/** The one thing wrong with the request, in words a client can show a person. */
export function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'bad request'
  const path = issue.path.join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

export function publicUser(user: User): { id: string; visibleAddress: string; remoteAddress: string | null } {
  return { id: user.id, visibleAddress: user.visibleAddress, remoteAddress: user.remoteAddress }
}
