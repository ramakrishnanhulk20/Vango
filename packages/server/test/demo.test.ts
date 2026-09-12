// Covers the parts of the demo script that need no network: reading the command line,
// remembering the throwaway customer wallet, and the bodies it signs. It does NOT cover
// the live API or the chain: no test here proves the API accepts these bodies, that a
// payment reaches a block, or that a reward can be confirmed. The demo run itself and
// the prove-it run cover those against the testnet.

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { KeyPair } from '@nimiq/core'
import { describe, expect, it } from 'vitest'
import { loadDemoCustomer, loginBody, parseArgs, signedBody } from '../src/cli/demo.js'
import { buildLoginMessage, buildRedeemMessage } from '../src/domain/challenges.js'
import { verifySignedMessage } from '../src/nimiq/verify.js'

const NONCE = '0123456789abcdef0123456789abcdef'

const EXPIRY = 1789117263760

function seedFileIn(folder: string): string {
  return resolve(mkdtempSync(resolve(tmpdir(), folder)), 'demo-customer.json')
}

describe('parseArgs', () => {
  it('reads a customer run with its card code and stamp count', () => {
    expect(parseArgs(['customer', '5fqq2j56', '--stamps', '2'])).toEqual({
      ok: true,
      args: { command: 'customer', code: '5FQQ2J56', stamps: 2 },
    })
    expect(parseArgs(['customer', '5FQQ2J56', '--stamps=4'])).toEqual({
      ok: true,
      args: { command: 'customer', code: '5FQQ2J56', stamps: 4 },
    })
    expect(parseArgs(['customer', '5FQQ2J56'])).toEqual({
      ok: true,
      args: { command: 'customer', code: '5FQQ2J56', stamps: null },
    })
  })

  it('refuses a card code that is not one, a bad stamp count and an unknown flag', () => {
    expect(parseArgs(['customer', 'AEIOU'])).toEqual({ ok: false, error: 'AEIOU is not a card code' })
    expect(parseArgs(['customer', '5FQQ2J56', '--stamps', '0'])).toEqual({
      ok: false,
      error: '--stamps must be a whole number from 1 to 20, got 0',
    })
    expect(parseArgs(['customer', '5FQQ2J56', '--visits', '3'])).toEqual({
      ok: false,
      error: 'customer does not take --visits',
    })
    expect(parseArgs(['customer', '5FQQ2J56', '--stamps'])).toEqual({ ok: false, error: '--stamps needs a value' })
  })

  it('reads a confirm run from six digits, a token or the QR payload', () => {
    const token = 'vr1.0123456789abcdef0123456789abcdef'

    expect(parseArgs(['confirm', '538531'])).toEqual({
      ok: true,
      args: { command: 'confirm', handle: '538531', merchantKey: null },
    })
    expect(parseArgs(['confirm', `vango-redeem:${token}`])).toEqual({
      ok: true,
      args: { command: 'confirm', handle: `vango-redeem:${token}`, merchantKey: null },
    })
    expect(parseArgs(['confirm', token, '--merchant-key', 'ab'.repeat(32)])).toEqual({
      ok: true,
      args: { command: 'confirm', handle: token, merchantKey: 'ab'.repeat(32) },
    })
    expect(parseArgs(['confirm', '53853'])).toEqual({
      ok: false,
      error: '53853 is neither a six-digit code nor a reward token',
    })
    expect(parseArgs(['confirm', '538531', '--merchant-key', 'abc'])).toEqual({
      ok: false,
      error: '--merchant-key must be 64 hex characters',
    })
  })

  it('reads status, and refuses an empty or unknown command', () => {
    expect(parseArgs(['status'])).toEqual({ ok: true, args: { command: 'status' } })
    expect(parseArgs(['status', 'now'])).toEqual({ ok: false, error: 'status takes no arguments' })
    expect(parseArgs([])).toEqual({ ok: false, error: 'name a demo to run: customer, confirm or status' })
    expect(parseArgs(['redeem'])).toEqual({
      ok: false,
      error: 'redeem is not a demo, pick customer, confirm or status',
    })
  })
})

describe('loadDemoCustomer', () => {
  it('writes a seed on the first run and hands back the same wallet on the second', () => {
    const file = seedFileIn('vango-demo-')

    const first = loadDemoCustomer(file)
    const second = loadDemoCustomer(file)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.address).toBe(first.address)
    expect(first.address).toMatch(/^NQ[0-9A-Z]{34}$/)

    const saved = JSON.parse(readFileSync(file, 'utf8')) as { seed: string; address: string }
    expect(saved.seed).toMatch(/^[0-9a-f]{64}$/)
    expect(saved.address).toBe(first.address)
  })

  it('gives two different wallets for two different files', () => {
    const one = loadDemoCustomer(seedFileIn('vango-demo-one-'))
    const two = loadDemoCustomer(seedFileIn('vango-demo-two-'))

    expect(one.address).not.toBe(two.address)
  })

  it('refuses to overwrite a seed file it cannot read, because the NIM would be lost', () => {
    const file = seedFileIn('vango-demo-broken-')
    writeFileSync(file, 'not json at all', 'utf8')

    expect(() => loadDemoCustomer(file)).toThrow(/not readable JSON/)

    writeFileSync(file, JSON.stringify({ seed: 'too short' }), 'utf8')
    expect(() => loadDemoCustomer(file)).toThrow(/64 character seed/)
  })
})

describe('the bodies the demo signs', () => {
  it('signs a login challenge in the shape the server verifies', () => {
    const keyPair = KeyPair.generate()
    const message = buildLoginMessage(NONCE, EXPIRY)

    const body = loginBody(keyPair, message)

    expect(body.visibleAddress).toBe(keyPair.toAddress().toUserFriendlyAddress().replace(/\s+/g, ''))
    expect(
      verifySignedMessage({
        address: body.visibleAddress,
        publicKey: body.publicKey,
        signature: body.signature,
        message: body.message,
      }),
    ).toEqual({ ok: true, address: keyPair.toAddress().toUserFriendlyAddress() })
  })

  it('signs a redeem challenge in the shape the server verifies', () => {
    const keyPair = KeyPair.generate()
    const message = buildRedeemMessage('5FQQ2J56', NONCE, EXPIRY)

    const body = signedBody(keyPair, message)

    expect(body.message).toBe(message)
    expect(
      verifySignedMessage({
        address: keyPair.toAddress().toUserFriendlyAddress(),
        publicKey: body.publicKey,
        signature: body.signature,
        message: body.message,
      }),
    ).toEqual({ ok: true, address: keyPair.toAddress().toUserFriendlyAddress() })
  })

  it('a signature over one challenge does not verify against another', () => {
    const keyPair = KeyPair.generate()
    const body = signedBody(keyPair, buildRedeemMessage('5FQQ2J56', NONCE, EXPIRY))

    const result = verifySignedMessage({
      address: keyPair.toAddress().toUserFriendlyAddress(),
      publicKey: body.publicKey,
      signature: body.signature,
      message: buildRedeemMessage('5FQQ2J57', NONCE, EXPIRY),
    })

    expect(result).toEqual({ ok: false, reason: 'signature does not match message' })
  })
})
