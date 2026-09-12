import { KeyPair } from '@nimiq/core'
import type { FastifyInstance } from 'fastify'
import { buildApp, type BuildOptions } from '../../src/app.js'
import type { Db } from '../../src/db/client.js'
import type { ChainTransaction } from '../../src/nimiq/rpc.js'
import { signWithKeyPair } from '../../src/nimiq/verify.js'

/** Transactions the fake node knows about, keyed by hash. */
export type FakeChain = Map<string, ChainTransaction>

export function fakeFetch(chain: FakeChain): (hash: string) => Promise<ChainTransaction | null> {
  return async (hash: string) => chain.get(hash) ?? null
}

/**
 * The real app wired to a throwaway database and a fake node. Rate limits are lifted
 * unless a test asks for them, so a test that makes many calls is not measuring them.
 */
export async function testApp(database: Db, options: Partial<BuildOptions> = {}): Promise<FastifyInstance> {
  return buildApp({
    database,
    logger: false,
    rateLimit: { global: 100000, auth: 100000, redeem: 100000 },
    ...options,
  })
}

export function addressOf(keyPair: KeyPair): string {
  return keyPair.toAddress().toUserFriendlyAddress().replace(/\s+/g, '')
}

export type SignedIn = { token: string; userId: string; visibleAddress: string; auth: { authorization: string } }

/** The whole sign-in dance a phone does: ask for a challenge, sign it, send it back. */
export async function signIn(
  app: FastifyInstance,
  keyPair: KeyPair,
  extras: { remoteAddress?: string; language?: string; fiat?: string } = {},
): Promise<SignedIn> {
  const challenge = await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {} })
  const { message } = challenge.json<{ message: string }>()
  const signed = signWithKeyPair(keyPair, message)

  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: {
      message,
      publicKey: signed.publicKey,
      signature: signed.signature,
      visibleAddress: addressOf(keyPair),
      ...extras,
    },
  })

  if (verified.statusCode !== 200) throw new Error(`sign in failed: ${verified.body}`)

  const body = verified.json<{ token: string; user: { id: string; visibleAddress: string } }>()
  return {
    token: body.token,
    userId: body.user.id,
    visibleAddress: body.user.visibleAddress,
    auth: { authorization: `Bearer ${body.token}` },
  }
}

/** A challenge and its signature, in the shape a verify or redeem route expects. */
export function signChallenge(
  keyPair: KeyPair,
  message: string,
): { message: string; publicKey: string; signature: string } {
  const signed = signWithKeyPair(keyPair, message)
  return { message, publicKey: signed.publicKey, signature: signed.signature }
}
