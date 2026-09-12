// Covers the in-memory challenge store only. It does NOT cover the live phone dialog,
// and it does NOT cover surviving a server restart: the store is deliberately memory
// only, so a restart drops every pending challenge.

import { describe, expect, it } from 'vitest'
import { NONCE_TTL_MS, NonceStore, buildMessage, parseMessage } from '../src/spike/nonces.js'

describe('NonceStore', () => {
  it('issues a message in the exact form the page signs', () => {
    const store = new NonceStore(() => 1_000_000)

    const challenge = store.issue()

    expect(challenge.message).toBe(`vango-spike:${challenge.nonce}:${challenge.expiresAt}`)
    expect(challenge.expiresAt).toBe(1_000_000 + NONCE_TTL_MS)
    expect(parseMessage(challenge.message)).toEqual({ nonce: challenge.nonce, expiresAt: challenge.expiresAt })
  })

  it('lets a nonce be spent once and calls the second attempt a replay', () => {
    const store = new NonceStore()
    const challenge = store.issue()

    expect(store.claim(challenge.nonce)).toEqual({ ok: true, nonce: challenge.nonce })
    expect(store.claim(challenge.nonce)).toEqual({ ok: false, reason: 'nonce used' })
  })

  it('refuses a nonce that has passed its expiry and forgets it', () => {
    let now = 1_000_000
    const store = new NonceStore(() => now)
    const challenge = store.issue()

    now += NONCE_TTL_MS + 1

    expect(store.claim(challenge.nonce)).toEqual({ ok: false, reason: 'nonce unknown' })
    expect(store.size).toBe(0)
  })

  it('refuses a nonce it never issued', () => {
    const store = new NonceStore()

    expect(store.claim('f'.repeat(32))).toEqual({ ok: false, reason: 'nonce unknown' })
  })

  it('rejects a message that is not a spike challenge', () => {
    expect(parseMessage('hello')).toBeNull()
    expect(parseMessage(buildMessage('not-hex', 1))).toBeNull()
  })
})
