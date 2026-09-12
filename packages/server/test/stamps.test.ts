// Covers the stamp engine against a real Postgres schema. It does NOT talk to the
// Nimiq chain: every transaction here is handed in already decoded, so nothing in this
// file proves the RPC client reads a real block correctly. It also does NOT cover
// redemption, which is a later work order.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { DbHandle } from '../src/db/client.js'
import { cards, redemptions, stamps, type Card, type User } from '../src/db/schema.js'
import { createCard } from '../src/domain/cards.js'
import { attachStampsToUser, claimByHash, progress, recordPayment } from '../src/domain/stamps.js'
import { code6FromTokenHash } from '../src/lib/tokens.js'
import type { ChainTransaction } from '../src/nimiq/rpc.js'
import { clearTables, freshDb, insertUser, randomAddress, randomHash } from './support/db.js'

let handle: DbHandle
let merchant: User
let customer: User
let card: Card
let receiving: string

beforeAll(async () => {
  handle = await freshDb()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)
  merchant = await insertUser(handle.db)
  customer = await insertUser(handle.db)
  receiving = merchant.visibleAddress
  card = await createCard(
    {
      merchantUserId: merchant.id,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free filter coffee',
      minLuna: 100000,
    },
    handle.db,
  )
})

function payment(changes: Partial<ChainTransaction> = {}): ChainTransaction {
  return {
    hash: randomHash(),
    blockNumber: 11148228,
    sender: customer.remoteAddress ?? customer.visibleAddress,
    recipient: receiving,
    valueLuna: 100000,
    memo: `vango:${card.code}`,
    ...changes,
  }
}

describe('recordPayment', () => {
  it('stamps a confirmed memo payment to the right card once', async () => {
    const tx = payment()

    const result = await recordPayment(tx, handle.db)

    expect(result).toEqual({ stamped: true, stampId: expect.any(String), cardCode: card.code, blockNumber: tx.blockNumber })

    const rows = await handle.db.select().from(stamps).where(eq(stamps.cardId, card.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      customerUserId: customer.id,
      senderAddress: customer.remoteAddress,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      valueLuna: 100000,
    })
  })

  it('refuses the same transaction hash twice', async () => {
    const tx = payment()

    const first = await recordPayment(tx, handle.db)
    const second = await recordPayment(tx, handle.db)
    const third = await recordPayment({ ...tx, valueLuna: 9_000_000 }, handle.db)

    expect(first.stamped).toBe(true)
    expect(second).toEqual({ stamped: false, reason: 'already stamped' })
    expect(third).toEqual({ stamped: false, reason: 'already stamped' })
    expect(await handle.db.select().from(stamps)).toHaveLength(1)
  })

  it("refuses a payment from the merchant's own address", async () => {
    const fromVisible = await recordPayment(payment({ sender: merchant.visibleAddress }), handle.db)
    const fromRemote = await recordPayment(
      payment({ sender: merchant.remoteAddress ?? merchant.visibleAddress }),
      handle.db,
    )
    const fromTill = await recordPayment(payment({ sender: receiving }), handle.db)

    expect(fromVisible).toEqual({ stamped: false, reason: 'sender is merchant' })
    expect(fromRemote).toEqual({ stamped: false, reason: 'sender is merchant' })
    expect(fromTill).toEqual({ stamped: false, reason: 'sender is merchant' })
    expect(await handle.db.select().from(stamps)).toHaveLength(0)
  })

  it("a merchant cannot stamp one of their cards from another of their cards' address", async () => {
    const otherCounter = randomAddress()

    // Written straight into the table because createCard no longer accepts an address. This
    // is the shape of a card opened before that rule, and of one edited in the database.
    await handle.db.insert(cards).values({
      code: 'BCDFGHJK',
      merchantUserId: merchant.id,
      name: 'Kumar Coffee, second counter',
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free filter coffee',
      receivingAddress: otherCounter,
    })

    const result = await recordPayment(payment({ sender: otherCounter }), handle.db)

    expect(result).toEqual({ stamped: false, reason: 'sender is merchant' })
    expect(await handle.db.select().from(stamps)).toHaveLength(0)
  })

  it('refuses a payment below the card minimum', async () => {
    const justUnder = await recordPayment(payment({ valueLuna: 99_999 }), handle.db)
    const exactly = await recordPayment(payment({ valueLuna: 100_000 }), handle.db)

    expect(justUnder).toEqual({ stamped: false, reason: 'below minimum' })
    expect(exactly.stamped).toBe(true)
  })

  it('refuses a memo for an unknown or inactive card', async () => {
    const unknown = await recordPayment(payment({ memo: 'vango:9BCDFGHJ' }), handle.db)

    await handle.db.update(cards).set({ active: false }).where(eq(cards.id, card.id))
    const inactive = await recordPayment(payment(), handle.db)

    expect(unknown).toEqual({ stamped: false, reason: 'unknown card' })
    expect(inactive).toEqual({ stamped: false, reason: 'card inactive' })
  })

  it('refuses a payment that carries no memo, the wrong memo, the wrong address or no block', async () => {
    expect(await recordPayment(payment({ memo: null }), handle.db)).toEqual({ stamped: false, reason: 'no memo' })
    expect(await recordPayment(payment({ memo: 'thanks' }), handle.db)).toEqual({
      stamped: false,
      reason: 'memo not vango',
    })
    expect(await recordPayment(payment({ recipient: randomAddress() }), handle.db)).toEqual({
      stamped: false,
      reason: 'wrong recipient',
    })
    expect(await recordPayment(payment({ blockNumber: 0 }), handle.db)).toEqual({
      stamped: false,
      reason: 'not included',
    })
  })

  it('stamps a payment from a wallet nobody has claimed yet, with no owner', async () => {
    const result = await recordPayment(payment({ sender: randomAddress() }), handle.db)

    expect(result.stamped).toBe(true)
    const [row] = await handle.db.select().from(stamps)
    expect(row?.customerUserId).toBeNull()
  })
})

describe('claimByHash', () => {
  it('stamps the hash the phone reports without waiting for the watcher', async () => {
    const tx = payment()

    const found = await claimByHash(tx.hash, { database: handle.db, fetch: async () => tx })
    const missing = await claimByHash(randomHash(), { database: handle.db, fetch: async () => null })

    expect(found).toEqual({ stamped: true, stampId: expect.any(String), cardCode: card.code, blockNumber: tx.blockNumber })
    expect(missing).toEqual({ stamped: false, reason: 'not included' })
  })
})

describe('attachStampsToUser', () => {
  it('attaches an earlier unowned stamp when the wallet later opens the app', async () => {
    const visible = randomAddress()
    const remote = randomAddress()

    const early = await recordPayment(payment({ sender: remote }), handle.db)
    expect(early.stamped).toBe(true)
    expect((await handle.db.select().from(stamps))[0]?.customerUserId).toBeNull()

    const walletOwner = await insertUser(handle.db, { visible, remote })
    const moved = await attachStampsToUser(walletOwner.id, handle.db)

    expect(moved).toBe(1)
    expect((await handle.db.select().from(stamps))[0]?.customerUserId).toBe(walletOwner.id)
  })

  it('leaves stamps that belong to someone else alone', async () => {
    await recordPayment(payment(), handle.db)
    const stranger = await insertUser(handle.db)

    expect(await attachStampsToUser(stranger.id, handle.db)).toBe(0)
    expect((await handle.db.select().from(stamps))[0]?.customerUserId).toBe(customer.id)
  })
})

describe('progress', () => {
  it('counts a card full at its target and empty again after a confirmed redemption', async () => {
    for (let i = 0; i < 3; i += 1) await recordPayment(payment(), handle.db)

    const full = await progress(card.id, customer.id, handle.db)
    expect(full).toMatchObject({ rewardKind: 'nth_free', stamps: 3, target: 3, redeemable: true })

    const tokenHash = randomHash()
    await handle.db.insert(redemptions).values({
      cardId: card.id,
      customerUserId: customer.id,
      merchantUserId: merchant.id,
      stampsConsumed: 3,
      status: 'confirmed',
      confirmedAt: new Date(),
      tokenHash,
      code6: code6FromTokenHash(tokenHash),
      challengeNonce: randomHash().slice(0, 32),
      expiresAt: new Date(),
    })

    const after = await progress(card.id, customer.id, handle.db)
    expect(after).toMatchObject({ stamps: 0, redeemable: false })
  })

  it('owes cashback on what a customer has spent', async () => {
    const cashbackCard = await createCard(
      {
        merchantUserId: merchant.id,
        name: 'Anna Barber',
        rewardKind: 'cashback',
        cashbackBps: 200,
        rewardText: '2% back in NIM',
      },
      handle.db,
    )

    await recordPayment(payment({ memo: `vango:${cashbackCard.code}`, valueLuna: 1_000_000 }), handle.db)
    await recordPayment(payment({ memo: `vango:${cashbackCard.code}`, valueLuna: 500_000 }), handle.db)

    const owed = await progress(cashbackCard.id, customer.id, handle.db)

    expect(owed).toMatchObject({
      rewardKind: 'cashback',
      stamps: 2,
      target: null,
      totalLuna: 1_500_000,
      cashbackLuna: 30_000,
      redeemable: true,
    })
  })
})
