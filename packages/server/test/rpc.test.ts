// Covers the helpers around the RPC client. It does NOT cover the live RPC: the one
// test that calls the client hands it a canned answer, so a node that is down or that
// changes its response shape will not be caught by this file.

import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeMemo, fetchTransaction, lunaToNim } from '../src/nimiq/rpc.js'

// recipientData copied from a real Nimiq mainnet transaction,
// hash 8f446c5be0c86ac6440ddcce9ed91f8e836f739c1b3c8595e838b46f67b6c3ad.
const REAL_MEMO_HEX = '596f75206d696e6564204e494d206f6e204e696d69712e537061636521'

describe('decodeMemo', () => {
  it('reads the text out of a real transaction data field', () => {
    expect(decodeMemo(REAL_MEMO_HEX)).toBe('You mined NIM on Nimiq.Space!')
  })

  it('reads the memo the spike page attaches', () => {
    expect(decodeMemo(Buffer.from('vango:spike', 'utf8').toString('hex'))).toBe('vango:spike')
  })

  it('returns null for a transaction with no data', () => {
    expect(decodeMemo('')).toBeNull()
    expect(decodeMemo(null)).toBeNull()
    expect(decodeMemo(undefined)).toBeNull()
  })

  it('returns null for binary that is not readable text', () => {
    expect(decodeMemo('00010203')).toBeNull()
    expect(decodeMemo('fffefd')).toBeNull()
    expect(decodeMemo('abc')).toBeNull()
  })
})

describe('fetchTransaction', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchTransaction returns normalised addresses', async () => {
    // The node writes addresses in the spaced form. Everything downstream compares them
    // against the database, which stores them stripped and uppercase.
    const node = {
      hash: 'a'.repeat(64),
      blockNumber: 11_148_228,
      from: 'nq54 92v5 s1c3 eajf hve6 b2kb 8u31 6d3d vumc',
      to: 'NQ63 NLNX 4H6R M3R4 XB92 8Y1X 5GTS JUGC 5QFJ',
      value: 100000,
      recipientData: Buffer.from('vango:spike', 'utf8').toString('hex'),
    }

    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { data: node } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const tx = await fetchTransaction(node.hash)

    expect(tx?.sender).toBe('NQ5492V5S1C3EAJFHVE6B2KB8U316D3DVUMC')
    expect(tx?.recipient).toBe('NQ63NLNX4H6RM3R4XB928Y1X5GTSJUGC5QFJ')
    expect(tx?.memo).toBe('vango:spike')
  })
})

describe('lunaToNim', () => {
  it('converts whole and part amounts without losing a digit', () => {
    expect(lunaToNim(100000)).toBe('1')
    expect(lunaToNim(0)).toBe('0')
    expect(lunaToNim(1)).toBe('0.00001')
    expect(lunaToNim(31484574)).toBe('314.84574')
    expect(lunaToNim(110000 * 100000)).toBe('110000')
  })
})
