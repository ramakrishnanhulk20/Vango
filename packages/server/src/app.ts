import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import fastifyCors from '@fastify/cors'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify'
import { KeyPair, PrivateKey } from '@nimiq/core'
import { z } from 'zod'
import { allowedOrigins, config } from './config.js'
import { db, type Db } from './db/client.js'
import { requireUser } from './domain/auth.js'
import { decodeMemo, fetchTransaction, getTransactionByHash, isNotFound } from './nimiq/rpc.js'
import { NonceStore, parseMessage } from './spike/nonces.js'
import { verifySignedMessage } from './nimiq/verify.js'
import { registerAuthRoutes } from './routes/auth.js'
import { registerCardRoutes } from './routes/cards.js'
import { registerRedeemRoutes } from './routes/redeem.js'
import { registerStampRoutes } from './routes/stamps.js'
import { registerWalletRoutes } from './routes/wallet.js'
import type { RouteDeps } from './routes/context.js'

const here = dirname(fileURLToPath(import.meta.url))
const spikeDir = resolve(here, '../spike')

/**
 * Per minute, per IP. Signing in and redeeming are tighter than the rest because both
 * end in a signature check, which is the expensive thing an attacker would grind at.
 */
export const RATE_LIMITS = { global: 60, auth: 10, redeem: 20 }

const verifyBody = z.object({
  address: z.string(),
  publicKey: z.string(),
  signature: z.string(),
  message: z.string(),
})

const txParams = z.object({
  hash: z.string().regex(/^[0-9a-fA-F]{64}$/),
})

export type BuildOptions = {
  database?: Db
  fetchTransaction?: typeof fetchTransaction
  nonces?: NonceStore
  rateLimit?: Partial<typeof RATE_LIMITS>
  /** Tests turn the request log off so the run is readable. The server always logs. */
  logger?: boolean
}

export function merchantAddress(): string {
  const keyPair = KeyPair.derive(PrivateKey.fromHex(config.SPIKE_MERCHANT_PRIVATE_KEY))
  return keyPair.toAddress().toUserFriendlyAddress()
}

export async function buildApp(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger === false ? false : { level: 'info' } })
  const nonces = options.nonces ?? new NonceStore()
  const address = merchantAddress()
  const limits = { ...RATE_LIMITS, ...options.rateLimit }
  const origins = allowedOrigins()

  await app.register(fastifyCors, {
    origin: origins.length > 0 ? origins : false,
    credentials: false,
  })

  await app.register(fastifyRateLimit, {
    global: true,
    max: limits.global,
    timeWindow: '1 minute',
    // Keyed on the address the packet came from, never on anything the caller can set.
    keyGenerator: (request) => request.ip,
    onExceeded: (request) => {
      request.log.warn({ ip: request.ip, route: request.url }, 'rate limit hit')
    },
    // The plugin throws what this returns, so it has to be a real Error carrying the
    // status. The error handler below turns it into the same { error } shape as
    // everything else.
    errorResponseBuilder: (_request, context) => {
      const error = new Error('too many requests, wait a minute')
      return Object.assign(error, { statusCode: context.statusCode })
    },
  })

  await app.register(fastifyStatic, { root: spikeDir, prefix: '/spike/' })

  // Every failure leaves by the same door, so a client only ever parses { error }. A
  // 500 says nothing about what broke; the detail goes to the log, not to the caller.
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const status = typeof error.statusCode === 'number' ? error.statusCode : 500
    if (status >= 500) request.log.error({ err: error, route: request.url }, 'request failed')
    return reply.code(status).send({ error: status >= 500 ? 'something went wrong' : error.message })
  })

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not found' }))

  app.decorateRequest('vangoUser', null)

  const database = options.database ?? db()

  const deps: RouteDeps = {
    database,
    requireUser: requireUser(database),
    fetchTransaction: options.fetchTransaction ?? fetchTransaction,
    limits: {
      auth: { max: limits.auth, timeWindow: '1 minute' },
      redeem: { max: limits.redeem, timeWindow: '1 minute' },
    },
  }

  registerAuthRoutes(app, deps)
  registerCardRoutes(app, deps)
  registerStampRoutes(app, deps)
  registerWalletRoutes(app, deps)
  registerRedeemRoutes(app, deps)

  app.get('/spike', (_request, reply) => reply.sendFile('index.html'))

  app.get('/', (_request, reply) => reply.redirect('/spike'))

  app.get('/api/spike/merchant', () => ({ address }))

  app.post('/api/spike/challenge', () => nonces.issue())

  app.post('/api/spike/verify', (request, reply) => {
    const body = verifyBody.safeParse(request.body)
    if (!body.success) return reply.code(400).send({ ok: false, reason: 'bad request body' })

    const parsedMessage = parseMessage(body.data.message)
    if (!parsedMessage) return reply.code(400).send({ ok: false, reason: 'message is not a spike challenge' })

    const verified = verifySignedMessage(body.data)
    if (!verified.ok) return reply.code(400).send(verified)

    const claimed = nonces.claim(parsedMessage.nonce)
    if (!claimed.ok) return reply.code(400).send({ ok: false, reason: claimed.reason })

    request.log.info({ address: verified.address }, 'signature verified')
    return reply.send({ ok: true, address: verified.address })
  })

  app.get('/api/spike/tx/:hash', async (request, reply) => {
    const params = txParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ found: false, included: false, reason: 'bad hash' })

    try {
      const tx = await getTransactionByHash(params.data.hash)
      return reply.send({
        found: true,
        included: typeof tx.blockNumber === 'number' && tx.blockNumber > 0,
        blockNumber: tx.blockNumber,
        sender: tx.from,
        recipient: tx.to,
        valueLuna: tx.value,
        memo: decodeMemo(tx.recipientData),
      })
    } catch (error) {
      if (isNotFound(error)) return reply.send({ found: false, included: false })
      request.log.error({ err: error }, 'transaction lookup failed')
      return reply.code(502).send({ found: false, included: false, reason: 'rpc unavailable' })
    }
  })

  return app
}
