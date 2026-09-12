// Covers two invariants under random traffic: however a customer interleaves paying and
// redeeming, the stamps a confirmed reward consumed never add up to more than the stamps
// earned, and no two of one merchant's waiting rewards ever share their six digits. It
// does NOT cover two requests racing at the same instant (redeem.race.test.ts does), it
// does NOT force a six-digit collision, so the retry inside signRedemption is not proven
// here, and it does NOT cover the cashback side, which redeem.test.ts checks by example.

import { KeyPair } from '@nimiq/core'
import { and, count, eq, sum } from 'drizzle-orm'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import { redemptions, stamps, type Card, type User } from '../src/db/schema.js'
import { createCard } from '../src/domain/cards.js'
import { confirmRedemption, signRedemption, startRedemption } from '../src/domain/redemptions.js'
import { progress, recordPayment } from '../src/domain/stamps.js'
import { signWithKeyPair } from '../src/nimiq/verify.js'
import { addressOf } from './support/api.js'
import { clearTables, freshDb, insertUser, randomAddress, randomHash } from './support/db.js'

let handle: DbHandle
let merchant: User
let customer: User
let customerKey: KeyPair
let card: Card
let receiving: string
let customerRemote: string

const TARGET = 3

beforeAll(async () => {
  handle = await freshDb()
  await clearTables(handle.db)

  customerKey = KeyPair.generate()
  customerRemote = randomAddress()

  merchant = await insertUser(handle.db)
  receiving = merchant.visibleAddress
  customer = await insertUser(handle.db, {
    visible: customerKey.toAddress().toUserFriendlyAddress().replace(/\s+/g, ''),
    remote: customerRemote,
  })

  card = await createCard(
    {
      merchantUserId: merchant.id,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: TARGET,
      rewardText: 'Free filter coffee',
    },
    handle.db,
  )
}, 60_000)

afterAll(async () => {
  await handle.close()
})

async function payOnce(sender: string = customerRemote): Promise<void> {
  await recordPayment(
    {
      hash: randomHash(),
      blockNumber: 11_148_228,
      sender,
      recipient: receiving,
      valueLuna: 100000,
      memo: `vango:${card.code}`,
    },
    handle.db,
  )
}

/** The whole reward path, exactly as the two phones drive it. */
async function redeemOnce(): Promise<void> {
  const started = await startRedemption(customer, card.code, { database: handle.db })
  if (!started.ok) return

  const signed = signWithKeyPair(customerKey, started.message)
  const opened = await signRedemption(
    customer,
    { message: started.message, publicKey: signed.publicKey, signature: signed.signature },
    { database: handle.db },
  )
  if (!opened.ok) return

  await confirmRedemption(merchant.id, opened.token, { database: handle.db })
}

async function earnedAndConsumed(): Promise<{ earned: number; consumed: number }> {
  const [earned] = await handle.db
    .select({ value: count() })
    .from(stamps)
    .where(and(eq(stamps.cardId, card.id), eq(stamps.customerUserId, customer.id)))

  const [consumed] = await handle.db
    .select({ value: sum(redemptions.stampsConsumed) })
    .from(redemptions)
    .where(
      and(
        eq(redemptions.cardId, card.id),
        eq(redemptions.customerUserId, customer.id),
        eq(redemptions.status, 'confirmed'),
      ),
    )

  return { earned: earned?.value ?? 0, consumed: Number(consumed?.value ?? 0) }
}

describe('paying and redeeming in any order', () => {
  it('property: stamps consumed never exceed stamps earned', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('pay', 'redeem'), { minLength: 1, maxLength: 14 }),
        async (actions) => {
          await handle.db.delete(redemptions)
          await handle.db.delete(stamps)

          for (const action of actions) {
            if (action === 'pay') await payOnce()
            else await redeemOnce()
          }

          const { earned, consumed } = await earnedAndConsumed()
          const standing = await progress(card.id, customer.id, handle.db)

          expect(consumed).toBeLessThanOrEqual(earned)
          expect(consumed % TARGET).toBe(0)
          expect(standing.stamps).toBe(earned - consumed)
          expect(standing.redeemable).toBe(earned - consumed >= TARGET)
        },
      ),
      { numRuns: 25 },
    )
  }, 180_000)
})

describe("six digits inside one merchant's counter", () => {
  it("six-digit codes never collide among one merchant's pending rewards", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 6 }), async (howMany) => {
        await handle.db.delete(redemptions)
        await handle.db.delete(stamps)

        const handed: string[] = []

        for (let person = 0; person < howMany; person += 1) {
          const key = KeyPair.generate()
          const buyer = await insertUser(handle.db, { visible: addressOf(key), remote: null })

          for (let visit = 0; visit < TARGET; visit += 1) await payOnce(buyer.visibleAddress)

          const started = await startRedemption(buyer, card.code, { database: handle.db })
          if (!started.ok) throw new Error(`start refused: ${started.error}`)

          const signature = signWithKeyPair(key, started.message)
          const opened = await signRedemption(
            buyer,
            {
              message: started.message,
              publicKey: signature.publicKey,
              signature: signature.signature,
            },
            { database: handle.db },
          )
          if (!opened.ok) throw new Error(`sign refused: ${opened.error}`)

          handed.push(opened.code6)
        }

        const waiting = await handle.db
          .select({ code6: redemptions.code6 })
          .from(redemptions)
          .where(and(eq(redemptions.merchantUserId, merchant.id), eq(redemptions.status, 'pending')))

        expect(handed).toHaveLength(howMany)
        expect(new Set(handed).size).toBe(howMany)
        expect(waiting).toHaveLength(howMany)
        expect(new Set(waiting.map((row) => row.code6)).size).toBe(howMany)
      }),
      { numRuns: 10 },
    )
  }, 180_000)
})
