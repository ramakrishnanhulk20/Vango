// Covers signing in with a wallet signature and the session that comes out of it. It
// does NOT cover the phone side (nothing here opens a real Nimiq Pay dialog), it does
// NOT cover a session reaching its thirty-day expiry, and it does NOT cover rate
// limiting, which has its own file.

import { KeyPair } from '@nimiq/core'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import { sessions, users } from '../src/db/schema.js'
import { signWithKeyPair } from '../src/nimiq/verify.js'
import { hashToken } from '../src/lib/tokens.js'
import { addressOf, signIn, testApp } from './support/api.js'
import { clearTables, freshDb, randomAddress } from './support/db.js'

let handle: DbHandle
let app: FastifyInstance
let wallet: KeyPair

beforeAll(async () => {
  handle = await freshDb()
  app = await testApp(handle.db)
}, 60_000)

afterAll(async () => {
  await app.close()
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)
  wallet = KeyPair.generate()
})

async function challenge(): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {} })
  return response.json<{ message: string }>().message
}

describe('POST /api/auth/verify', () => {
  it('logs in with a wallet signature and returns a session', async () => {
    const message = await challenge()
    expect(message).toMatch(/^vango-login:[0-9a-f]{32}:\d+$/)

    const signed = signWithKeyPair(wallet, message)
    const remoteAddress = randomAddress()

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: {
        message,
        publicKey: signed.publicKey,
        signature: signed.signature,
        visibleAddress: addressOf(wallet),
        remoteAddress,
        language: 'en',
        fiat: 'USD',
      },
    })

    expect(response.statusCode).toBe(200)
    const body = response.json<{ token: string; user: { id: string; remoteAddress: string } }>()
    expect(body.token).toMatch(/^vs1\.[0-9a-f]{64}$/)
    expect(body.user.remoteAddress).toBe(remoteAddress)

    const [stored] = await handle.db.select().from(sessions)
    expect(stored?.tokenHash).toBe(hashToken(body.token))
    expect(JSON.stringify(stored)).not.toContain(body.token)

    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${body.token}` },
    })

    expect(me.statusCode).toBe(200)
    expect(me.json<{ user: { id: string } }>().user.id).toBe(body.user.id)
  })

  it('refuses a login signature for a different address', async () => {
    const message = await challenge()
    const signed = signWithKeyPair(wallet, message)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: {
        message,
        publicKey: signed.publicKey,
        signature: signed.signature,
        visibleAddress: addressOf(KeyPair.generate()),
      },
    })

    expect(response.statusCode).toBe(401)
    expect(response.json<{ error: string }>().error).toBe('public key does not match address')
    expect(await handle.db.select().from(sessions)).toHaveLength(0)
  })

  it('refuses a reused login nonce', async () => {
    const message = await challenge()
    const signed = signWithKeyPair(wallet, message)
    const payload = {
      message,
      publicKey: signed.publicKey,
      signature: signed.signature,
      visibleAddress: addressOf(wallet),
    }

    const first = await app.inject({ method: 'POST', url: '/api/auth/verify', payload })
    const replay = await app.inject({ method: 'POST', url: '/api/auth/verify', payload })

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(401)
    expect(replay.json<{ error: string }>().error).toBe('nonce used')
    expect(await handle.db.select().from(sessions)).toHaveLength(1)
  })

  it('refuses a remote account that already belongs to another wallet', async () => {
    const shared = randomAddress()
    await signIn(app, wallet, { remoteAddress: shared })

    const other = KeyPair.generate()
    const message = await challenge()
    const signed = signWithKeyPair(other, message)

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/verify',
      payload: {
        message,
        publicKey: signed.publicKey,
        signature: signed.signature,
        visibleAddress: addressOf(other),
        remoteAddress: shared,
      },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json<{ error: string }>().error).toBe('that remote account belongs to another wallet')
    expect(await handle.db.select().from(users)).toHaveLength(1)
  })
})

describe('GET /api/me', () => {
  it('refuses a session token that does not exist', async () => {
    const invented = `vs1.${'a'.repeat(64)}`

    const guessed = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${invented}` },
    })
    const missing = await app.inject({ method: 'GET', url: '/api/me' })

    expect(guessed.statusCode).toBe(401)
    expect(guessed.json()).toEqual({ error: 'not signed in' })
    expect(missing.statusCode).toBe(401)
  })

  it('refuses a user id used as if it were a token', async () => {
    const signedIn = await signIn(app, wallet)

    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${signedIn.userId}` },
    })

    expect(response.statusCode).toBe(401)
    const [row] = await handle.db.select().from(users).where(eq(users.id, signedIn.userId))
    expect(row?.visibleAddress).toBe(addressOf(wallet))
  })
})
