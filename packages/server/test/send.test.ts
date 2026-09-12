// Covers building and signing a payment with a memo, offline. Nothing here talks to a
// node, so it does NOT prove that a node accepts the bytes, that the fee is enough, or
// that the account had the balance. The prove-it run covers those against the testnet.

import { KeyPair, Transaction } from '@nimiq/core'
import { describe, expect, it } from 'vitest'
import { buildSignedTransaction, networkIdFor, toRawHex } from '../src/nimiq/send.js'
import { randomAddress } from './support/db.js'

const TEST_ALBATROSS = 5

function inputs(changes: Partial<Parameters<typeof buildSignedTransaction>[0]> = {}) {
  return {
    keyPair: KeyPair.generate(),
    recipient: randomAddress(),
    valueLuna: 100000,
    data: 'vango:BCDFGHJK',
    validityStartHeight: 11_151_596,
    networkId: TEST_ALBATROSS,
    ...changes,
  }
}

describe('buildSignedTransaction', () => {
  it('builds and signs a memo transaction offline', () => {
    const input = inputs()
    const transaction = buildSignedTransaction(input)

    transaction.verify(1, TEST_ALBATROSS)

    const hex = toRawHex(transaction)
    const back = Transaction.deserialize(Uint8Array.from(Buffer.from(hex, 'hex')))

    expect(back.hash()).toBe(transaction.hash())
    expect(back.sender.toUserFriendlyAddress().replace(/\s+/g, '')).toBe(
      input.keyPair.toAddress().toUserFriendlyAddress().replace(/\s+/g, ''),
    )
    expect(back.recipient.toUserFriendlyAddress().replace(/\s+/g, '')).toBe(input.recipient)
    expect(back.value).toBe(100000n)
    expect(back.fee).toBe(0n)
    expect(back.networkId).toBe(TEST_ALBATROSS)
    expect(new TextDecoder().decode(back.data)).toBe('vango:BCDFGHJK')
  })

  it('refuses what the chain would refuse', () => {
    const keyPair = KeyPair.generate()
    const own = keyPair.toAddress().toUserFriendlyAddress()

    expect(() => buildSignedTransaction(inputs({ keyPair, recipient: own }))).toThrow(/own sender/)
    expect(() => buildSignedTransaction(inputs({ recipient: 'NQ00 NOT AN ADDRESS' }))).toThrow(/not a Nimiq address/)
    expect(() => buildSignedTransaction(inputs({ valueLuna: 0 }))).toThrow(/above zero/)
    expect(() => buildSignedTransaction(inputs({ data: 'x'.repeat(65) }))).toThrow(/limit is 64/)
  })

  it('knows the testnet id and refuses to sign for the mainnet', () => {
    expect(networkIdFor('TestAlbatross')).toBe(TEST_ALBATROSS)
    expect(() => networkIdFor('MainAlbatross')).toThrow(/TestAlbatross only/)
  })
})
