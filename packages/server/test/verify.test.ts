// Covers the server side of wallet login only. It does NOT cover the live phone
// dialog: no test here proves Nimiq Pay's sign() returns hex in this exact shape, or
// that a user can approve the native popup at all. That is what the spike page is for.

import { describe, expect, it } from 'vitest'
import { KeyPair } from '@nimiq/core'
import { signWithKeyPair, verifySignedMessage } from '../src/nimiq/verify.js'

const MESSAGE = 'vango-spike:0123456789abcdef0123456789abcdef:1789117263760'

describe('verifySignedMessage', () => {
  it('verifies a signature produced by @nimiq/core over the Nimiq signed-message prefix', () => {
    const signed = signWithKeyPair(KeyPair.generate(), MESSAGE)

    const result = verifySignedMessage(signed)

    expect(result).toEqual({ ok: true, address: signed.address })
  })

  it('rejects a signature whose public key does not derive to the claimed address', () => {
    const signed = signWithKeyPair(KeyPair.generate(), MESSAGE)
    const someoneElse = KeyPair.generate().toAddress().toUserFriendlyAddress()

    const result = verifySignedMessage({ ...signed, address: someoneElse })

    expect(result).toEqual({ ok: false, reason: 'public key does not match address' })
  })

  it('rejects a message changed by a single character after signing', () => {
    const signed = signWithKeyPair(KeyPair.generate(), MESSAGE)

    const result = verifySignedMessage({ ...signed, message: `${MESSAGE.slice(0, -1)}1` })

    expect(result).toEqual({ ok: false, reason: 'signature does not match message' })
  })

  it('rejects malformed hex in the public key and in the signature', () => {
    const signed = signWithKeyPair(KeyPair.generate(), MESSAGE)

    expect(verifySignedMessage({ ...signed, publicKey: 'zz' })).toEqual({ ok: false, reason: 'malformed public key' })
    expect(verifySignedMessage({ ...signed, signature: 'deadbeef' })).toEqual({ ok: false, reason: 'malformed signature' })
    expect(verifySignedMessage({ ...signed, address: 'not-an-address' })).toEqual({ ok: false, reason: 'bad address format' })
  })
})
