// Covers the per-IP rate limits on the routes that end in a signature check. It does
// NOT cover the window resetting after a minute (the clock is real here, so the test
// would have to wait), and it does NOT cover several server processes sharing a count.

import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp, RATE_LIMITS } from '../src/app.js'
import type { DbHandle } from '../src/db/client.js'
import { freshDb } from './support/db.js'

let handle: DbHandle
let app: FastifyInstance

beforeAll(async () => {
  handle = await freshDb()
  app = await buildApp({ database: handle.db, logger: false })
}, 60_000)

afterAll(async () => {
  await app.close()
  await handle.close()
})

function challenge(headers: Record<string, string> = {}) {
  return app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {}, headers })
}

describe('rate limiting', () => {
  it('rate limits repeated login attempts', async () => {
    const codes: number[] = []
    for (let attempt = 0; attempt < RATE_LIMITS.auth + 1; attempt += 1) {
      codes.push((await challenge()).statusCode)
    }

    expect(codes.slice(0, RATE_LIMITS.auth)).toEqual(Array(RATE_LIMITS.auth).fill(200))
    expect(codes.at(-1)).toBe(429)

    const blocked = await challenge()
    expect(blocked.json()).toEqual({ error: 'too many requests, wait a minute' })
  })

  it('counts against the caller, not a header the caller chose', async () => {
    const spoofed = await challenge({ 'x-forwarded-for': '203.0.113.9' })

    expect(spoofed.statusCode).toBe(429)
  })
})
