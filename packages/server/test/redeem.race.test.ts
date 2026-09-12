// Covers two requests for the same reward landing at the same instant, which is the one
// case the application checks cannot catch on their own. It does NOT prove which guard
// refused the second request (the "already waiting" read or the unique index behind it),
// only that exactly one reward exists afterwards. It does NOT cover two merchants
// confirming one reward at once, and it does NOT cover a real Postgres with two
// connections, because PGlite runs one statement at a time.

import { KeyPair } from '@nimiq/core'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import { redemptions, type Card, type User } from '../src/db/schema.js'
import { createCard } from '../src/domain/cards.js'
import { signRedemption, startRedemption, type SignResult } from '../src/domain/redemptions.js'
import { recordPayment } from '../src/domain/stamps.js'
import { signWithKeyPair } from '../src/nimiq/verify.js'
import { clearTables, freshDb, insertUser, randomHash } from './support/db.js'
import { addressOf } from './support/api.js'

let handle: DbHandle
let merchant: User
let customer: User
let customerKey: KeyPair
let card: Card

beforeAll(async () => {
  handle = await freshDb()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)

  customerKey = KeyPair.generate()
  merchant = await insertUser(handle.db)
  customer = await insertUser(handle.db, { visible: addressOf(customerKey), remote: null })

  card = await createCard(
    {
      merchantUserId: merchant.id,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free filter coffee',
    },
    handle.db,
  )

  for (let visit = 0; visit < 3; visit += 1) {
    await recordPayment(
      {
        hash: randomHash(),
        blockNumber: 11_148_228,
        sender: customer.visibleAddress,
        recipient: card.receivingAddress,
        valueLuna: 100000,
        memo: `vango:${card.code}`,
      },
      handle.db,
    )
  }
})

async function nonceMessage(): Promise<string> {
  const started = await startRedemption(customer, card.code, { database: handle.db })
  if (!started.ok) throw new Error(`start refused: ${started.error}`)
  return started.message
}

function sign(message: string): Promise<SignResult> {
  const signed = signWithKeyPair(customerKey, message)
  return signRedemption(
    customer,
    { message, publicKey: signed.publicKey, signature: signed.signature },
    { database: handle.db },
  )
}

describe('signRedemption under a race', () => {
  it('two concurrent signs for one full card open exactly one reward', async () => {
    const first = await nonceMessage()
    const second = await nonceMessage()

    const results = await Promise.all([sign(first), sign(second)])

    expect(results.filter((result) => result.ok)).toHaveLength(1)

    const refused = results.find((result) => !result.ok)
    expect(refused).toMatchObject({ status: 409, error: 'a reward is already waiting for this card' })

    const rows = await handle.db.select().from(redemptions)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('pending')
  })
})
