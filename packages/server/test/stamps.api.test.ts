// Covers the two-second claim route: the phone reports the hash it just got from the
// wallet and gets a stamp back. It does NOT reach a real node (the transaction is
// served by a fake), and it does NOT cover the watcher, which stamps the same payment
// from the other direction.

import { KeyPair } from '@nimiq/core'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import type { ChainTransaction } from '../src/nimiq/rpc.js'
import { fakeFetch, signIn, testApp, type FakeChain, type SignedIn } from './support/api.js'
import { clearTables, freshDb, randomAddress, randomHash } from './support/db.js'

const chain: FakeChain = new Map()

let handle: DbHandle
let app: FastifyInstance
let merchant: SignedIn
let customer: SignedIn
let customerRemote: string
let receiving: string
let code: string

beforeAll(async () => {
  handle = await freshDb()
  app = await testApp(handle.db, { fetchTransaction: fakeFetch(chain) })
}, 60_000)

afterAll(async () => {
  await app.close()
  await handle.close()
})

beforeEach(async () => {
  chain.clear()
  await clearTables(handle.db)

  merchant = await signIn(app, KeyPair.generate())
  receiving = merchant.visibleAddress
  customerRemote = randomAddress()
  customer = await signIn(app, KeyPair.generate(), { remoteAddress: customerRemote })

  const created = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: merchant.auth,
    payload: {
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free filter coffee',
    },
  })
  code = created.json<{ code: string }>().code
})

function pay(changes: Partial<ChainTransaction> = {}): string {
  const tx: ChainTransaction = {
    hash: randomHash(),
    blockNumber: 11_148_228,
    sender: customerRemote,
    recipient: receiving,
    valueLuna: 100000,
    memo: `vango:${code}`,
    ...changes,
  }
  chain.set(tx.hash, tx)
  return tx.hash
}

describe('POST /api/stamps/claim', () => {
  it('claim by hash stamps once and returns progress', async () => {
    const hash = pay()

    const first = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash },
    })

    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({
      result: { stamped: true, cardCode: code },
      progress: { rewardKind: 'nth_free', stamps: 1, target: 3, redeemable: false },
    })

    const again = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash },
    })

    expect(again.statusCode).toBe(200)
    expect(again.json()).toEqual({ result: { stamped: false, reason: 'already stamped' } })

    const wallet = await app.inject({ method: 'GET', url: '/api/wallet', headers: customer.auth })
    expect(wallet.json<{ held: { code: string; progress: { stamps: number } }[] }>().held).toMatchObject([
      { code, progress: { stamps: 1 } },
    ])
  })

  it('tells the phone why a payment was not a stamp, without failing the request', async () => {
    const noMemo = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash: pay({ memo: null }) },
    })

    const tooSmall = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash: pay({ valueLuna: 99_999 }) },
    })

    const unknownHash = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash: randomHash() },
    })

    expect(noMemo.json()).toEqual({ result: { stamped: false, reason: 'no memo' } })
    expect(tooSmall.json()).toEqual({ result: { stamped: false, reason: 'below minimum' } })
    expect(unknownHash.json()).toEqual({ result: { stamped: false, reason: 'not included' } })
    expect(noMemo.statusCode).toBe(200)
  })

  it('keeps progress to itself when the payment came from a stranger', async () => {
    const hash = pay({ sender: randomAddress() })

    const response = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash },
    })

    expect(response.json<{ result: { stamped: boolean }; progress?: unknown }>().result.stamped).toBe(true)
    expect(response.json<{ progress?: unknown }>().progress).toBeUndefined()
  })

  it('refuses a claim with no session', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/stamps/claim', payload: { hash: pay() } })

    expect(response.statusCode).toBe(401)
  })
})
