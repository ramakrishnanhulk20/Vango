import { and, eq, gt, lt, ne } from 'drizzle-orm'
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify'
import { db, type Db } from '../db/client.js'
import { isUniqueViolation } from '../db/errors.js'
import { sessions, users, type User } from '../db/schema.js'
import { normalizeAddress } from '../lib/address.js'
import { bearerToken, hashToken, isSessionToken, newSessionToken } from '../lib/tokens.js'
import { verifySignedMessage } from '../nimiq/verify.js'
import { consumeChallenge, parseLoginMessage } from './challenges.js'
import { attachStampsToUser } from './stamps.js'

/** A phone stays signed in for a month, then signs one more message. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

declare module 'fastify' {
  interface FastifyRequest {
    vangoUser: User | null
  }
}

export type LoginInput = {
  message: string
  publicKey: string
  signature: string
  visibleAddress: string
  remoteAddress?: string | undefined
  language?: string | undefined
  fiat?: string | undefined
}

export type LoginResult =
  | { ok: true; token: string; user: User; attachedStamps: number }
  | { ok: false; status: number; error: string }

export type NewSession = { token: string; expiresAt: Date }

/**
 * Turns a signed challenge into a signed-in user.
 *
 * The wallet proves it holds the key for the visible address, and the nonce inside the
 * message proves the signature was made for this login and not copied from an older
 * one. The remote account is recorded at the same time because Nimiq Pay pays out of it,
 * and a payment from an address we do not know cannot be credited to anybody.
 */
export async function login(input: LoginInput, database: Db = db()): Promise<LoginResult> {
  const parsed = parseLoginMessage(input.message)
  if (!parsed) return { ok: false, status: 400, error: 'message is not a vango login challenge' }

  const visibleAddress = normalizeAddress(input.visibleAddress)
  if (!visibleAddress) return { ok: false, status: 400, error: 'visible address is not a Nimiq address' }

  let remoteAddress: string | null = null
  if (input.remoteAddress !== undefined && input.remoteAddress !== '') {
    remoteAddress = normalizeAddress(input.remoteAddress)
    if (!remoteAddress) return { ok: false, status: 400, error: 'remote address is not a Nimiq address' }
  }

  const verified = verifySignedMessage({
    address: visibleAddress,
    publicKey: input.publicKey,
    signature: input.signature,
    message: input.message,
  })
  if (!verified.ok) return { ok: false, status: 401, error: verified.reason }

  const claimed = await consumeChallenge(parsed.nonce, 'login', null, database)
  if (!claimed.ok) return { ok: false, status: 401, error: claimed.reason }

  const user = await upsertUser(
    {
      visibleAddress,
      remoteAddress,
      language: input.language ?? null,
      fiat: input.fiat ?? null,
    },
    database,
  )
  if (!user.ok) return user

  const attachedStamps = await attachStampsToUser(user.user.id, database)
  const session = await createSession(user.user.id, database)

  return { ok: true, token: session.token, user: user.user, attachedStamps }
}

type UpsertInput = {
  visibleAddress: string
  remoteAddress: string | null
  language: string | null
  fiat: string | null
}

type UpsertResult = { ok: true; user: User } | { ok: false; status: number; error: string }

/**
 * Creates the wallet's record or refreshes it. A remote account belongs to exactly one
 * wallet: if it already sits under a different visible address the login is refused
 * rather than moved, because moving it would hand that wallet's stamps to someone else.
 */
export async function upsertUser(input: UpsertInput, database: Db = db()): Promise<UpsertResult> {
  if (input.remoteAddress !== null) {
    const [clash] = await database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.remoteAddress, input.remoteAddress), ne(users.visibleAddress, input.visibleAddress)))
      .limit(1)

    if (clash) return { ok: false, status: 409, error: 'that remote account belongs to another wallet' }
  }

  const changes: Record<string, unknown> = { lastSeenAt: new Date() }
  if (input.remoteAddress !== null) changes['remoteAddress'] = input.remoteAddress
  if (input.language !== null) changes['language'] = input.language
  if (input.fiat !== null) changes['fiat'] = input.fiat

  try {
    const [row] = await database
      .insert(users)
      .values({
        visibleAddress: input.visibleAddress,
        remoteAddress: input.remoteAddress,
        language: input.language,
        fiat: input.fiat,
      })
      .onConflictDoUpdate({ target: users.visibleAddress, set: changes })
      .returning()

    if (!row) return { ok: false, status: 500, error: 'could not save the wallet' }
    return { ok: true, user: row }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, status: 409, error: 'that remote account belongs to another wallet' }
    }
    throw error
  }
}

/** Mints a session token. The plain token is returned once here and never stored. */
export async function createSession(userId: string, database: Db = db()): Promise<NewSession> {
  const token = newSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await database.delete(sessions).where(lt(sessions.expiresAt, new Date()))
  await database.insert(sessions).values({ tokenHash: hashToken(token), userId, expiresAt })

  return { token, expiresAt }
}

/** The user behind a bearer token, or null when the token is unknown or past its month. */
export async function resolveSession(token: string, database: Db = db()): Promise<User | null> {
  if (!isSessionToken(token)) return null

  const tokenHash = hashToken(token)
  const now = new Date()

  const [row] = await database
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1)

  if (!row) return null

  await database.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.tokenHash, tokenHash))

  return row.user
}

/**
 * The gate on every route that acts for a wallet. A refusal is logged with the caller's
 * IP, which is the only thing an unauthenticated caller cannot choose.
 */
export function requireUser(database: Db): preHandlerAsyncHookHandler {
  return async function checkSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = bearerToken(request.headers.authorization)

    if (!token) {
      request.log.warn({ ip: request.ip, route: request.url }, 'auth refused: no bearer token')
      await reply.code(401).send({ error: 'not signed in' })
      return
    }

    const user = await resolveSession(token, database)
    if (!user) {
      request.log.warn({ ip: request.ip, route: request.url }, 'auth refused: token not accepted')
      await reply.code(401).send({ error: 'not signed in' })
      return
    }

    request.vangoUser = user
  }
}

/** The signed-in user on a route that ran requireUser. */
export function currentUser(request: FastifyRequest): User {
  const user = request.vangoUser
  if (!user) throw new Error('route used currentUser without requireUser')
  return user
}

/** The addresses a payment can arrive from for this wallet. */
export function ownedAddresses(user: User): string[] {
  return [user.visibleAddress, user.remoteAddress].filter((value): value is string => value !== null)
}
