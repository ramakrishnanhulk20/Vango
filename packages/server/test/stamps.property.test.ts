// Covers the one invariant that keeps the card honest: a stamp exists only for a
// confirmed payment that matched every card rule, and a repeated transaction hash never
// adds a second one. It does NOT cover concurrency (the calls here run one after
// another, so two watchers racing on the same hash is untested), and it does NOT cover
// redemption.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { eq } from 'drizzle-orm'
import type { DbHandle } from '../src/db/client.js'
import { stamps, type Card, type User } from '../src/db/schema.js'
import { createCard } from '../src/domain/cards.js'
import { recordPayment } from '../src/domain/stamps.js'
import type { ChainTransaction } from '../src/nimiq/rpc.js'
import { clearTables, freshDb, insertUser, randomAddress, randomHash } from './support/db.js'

let handle: DbHandle
let merchant: User
let customer: User
let card: Card
let receiving: string
let elsewhere: string

const MIN_LUNA = 100000

beforeAll(async () => {
  handle = await freshDb()
  await clearTables(handle.db)
  merchant = await insertUser(handle.db)
  customer = await insertUser(handle.db)
  receiving = merchant.visibleAddress
  elsewhere = randomAddress()
  card = await createCard(
    {
      merchantUserId: merchant.id,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 5,
      rewardText: 'Free filter coffee',
      minLuna: MIN_LUNA,
    },
    handle.db,
  )
}, 60_000)

afterAll(async () => {
  await handle.close()
})

const paymentShape = fc.record({
  repeatEarlier: fc.boolean(),
  toTheRightAddress: fc.boolean(),
  valueLuna: fc.integer({ min: 0, max: 400000 }),
  memoKind: fc.constantFrom('card', 'other card', 'none', 'chatter'),
  fromMerchant: fc.boolean(),
  blockNumber: fc.integer({ min: 0, max: 20 }),
})

function isStampable(tx: ChainTransaction): boolean {
  return (
    tx.blockNumber > 0 &&
    tx.memo === `vango:${card.code}` &&
    tx.recipient === receiving &&
    tx.valueLuna >= MIN_LUNA &&
    tx.sender !== merchant.visibleAddress &&
    tx.sender !== merchant.remoteAddress &&
    tx.sender !== receiving
  )
}

describe('recordPayment under random traffic', () => {
  it('property: stamp count never exceeds confirmed matching payments', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(paymentShape, { minLength: 1, maxLength: 12 }), async (shapes) => {
        await handle.db.delete(stamps)

        const hashes: string[] = []
        const stampable = new Set<string>()
        let matchingPayments = 0

        for (const shape of shapes) {
          const previous = hashes.at(-1)
          const hash = shape.repeatEarlier && previous ? previous : randomHash()
          hashes.push(hash)

          const memo =
            shape.memoKind === 'card'
              ? `vango:${card.code}`
              : shape.memoKind === 'other card'
                ? 'vango:9BCDFGHJ'
                : shape.memoKind === 'chatter'
                  ? 'thanks'
                  : null

          const tx: ChainTransaction = {
            hash,
            blockNumber: shape.blockNumber,
            sender: shape.fromMerchant
              ? merchant.visibleAddress
              : (customer.remoteAddress ?? customer.visibleAddress),
            recipient: shape.toTheRightAddress ? receiving : elsewhere,
            valueLuna: shape.valueLuna,
            memo,
          }

          if (isStampable(tx)) {
            matchingPayments += 1
            stampable.add(tx.hash)
          }

          await recordPayment(tx, handle.db)
        }

        const written = await handle.db.select().from(stamps).where(eq(stamps.cardId, card.id))

        expect(written.length).toBeLessThanOrEqual(matchingPayments)
        expect(written.length).toBe(stampable.size)
        for (const row of written) {
          expect(row.valueLuna).toBeGreaterThanOrEqual(MIN_LUNA)
          expect(stampable.has(row.txHash)).toBe(true)
        }
      }),
      { numRuns: 30 },
    )
  }, 120_000)
})
