// Covers opening a loyalty card only. It does NOT cover the API layer around it (no
// authentication is checked here, that arrives with the routes), and it does NOT cover
// editing or closing a card.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import type { DbHandle } from '../src/db/client.js'
import { activeReceivingAddresses, cardByCode, createCard } from '../src/domain/cards.js'
import { clearTables, freshDb, insertUser, randomAddress } from './support/db.js'

let handle: DbHandle
let merchantId: string
/** The merchant's own wallet, which is the only address a card is ever paid into. */
const receiving = 'NQ66 KBKY VKLD 6J8H N23B Y7MV PCT2 7X2D K54R'.replace(/\s+/g, '')

beforeAll(async () => {
  handle = await freshDb()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)
  merchantId = (await insertUser(handle.db, { visible: receiving })).id
})

describe('createCard', () => {
  it('opens a card with a short code and stores the address in one form', async () => {
    const card = await createCard(
      {
        merchantUserId: merchantId,
        name: 'Kumar Coffee',
        rewardKind: 'nth_free',
        targetVisits: 5,
        rewardText: 'Free coffee',
      },
      handle.db,
    )

    expect(card.code).toMatch(/^[0-9BCDFGHJKMNPQRSTVWXYZ]{8}$/)
    expect(card.receivingAddress).toBe(receiving)
    expect(card.minLuna).toBe(100000)
    expect(card.active).toBe(true)
    expect(card.cashbackBps).toBeNull()
    expect(await cardByCode(card.code, handle.db)).toMatchObject({ id: card.id })
  })

  it('opens a cashback card with the share the merchant chose', async () => {
    const card = await createCard(
      {
        merchantUserId: merchantId,
        name: 'Anna Barber',
        rewardKind: 'cashback',
        cashbackBps: 200,
        rewardText: '2% back in NIM',
        minLuna: 500000,
      },
      handle.db,
    )

    expect(card.cashbackBps).toBe(200)
    expect(card.targetVisits).toBeNull()
    expect(card.minLuna).toBe(500000)
  })

  it('refuses a reward rule the stamp engine could not act on', async () => {
    const base = {
      merchantUserId: merchantId,
      name: 'Kumar Coffee',
      rewardText: 'Free coffee',
    } as const

    await expect(createCard({ ...base, rewardKind: 'nth_free', targetVisits: 1 }, handle.db)).rejects.toBeInstanceOf(ZodError)
    await expect(createCard({ ...base, rewardKind: 'nth_free', targetVisits: 21 }, handle.db)).rejects.toBeInstanceOf(ZodError)
    await expect(createCard({ ...base, rewardKind: 'cashback', cashbackBps: 0 }, handle.db)).rejects.toBeInstanceOf(ZodError)
    await expect(createCard({ ...base, rewardKind: 'cashback', cashbackBps: 2001 }, handle.db)).rejects.toBeInstanceOf(ZodError)
    await expect(
      createCard({ ...base, rewardKind: 'nth_free', targetVisits: 5, minLuna: 99999 }, handle.db),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      createCard({ ...base, rewardKind: 'nth_free', targetVisits: 5, name: 'x'.repeat(41) }, handle.db),
    ).rejects.toBeInstanceOf(ZodError)
    await expect(
      createCard({ ...base, rewardKind: 'nth_free', targetVisits: 5, rewardText: 'x'.repeat(61) }, handle.db),
    ).rejects.toBeInstanceOf(ZodError)
  })

  it('gives every card its own code', async () => {
    const codes = new Set<string>()
    for (let i = 0; i < 30; i += 1) {
      const card = await createCard(
        {
          merchantUserId: merchantId,
          name: `Stall ${i}`,
          rewardKind: 'nth_free',
          targetVisits: 5,
          rewardText: 'Free chai',
        },
        handle.db,
      )
      codes.add(card.code)
    }

    expect(codes.size).toBe(30)
  })

  it('a card always receives at the merchant\'s own address', async () => {
    const somebodyElse = randomAddress()

    // The input shape has no receiving address in it, so naming one needs a cast. This is
    // what a client written against the old shape would send.
    const card = await createCard(
      {
        merchantUserId: merchantId,
        name: 'Kumar Coffee',
        rewardKind: 'nth_free',
        targetVisits: 5,
        rewardText: 'Free coffee',
        receivingAddress: somebodyElse,
      } as never,
      handle.db,
    )

    expect(card.receivingAddress).toBe(receiving)
    expect(card.receivingAddress).not.toBe(somebodyElse)
  })
})

describe('activeReceivingAddresses', () => {
  it('lists each address once, however many cards share it', async () => {
    for (const name of ['Morning card', 'Evening card']) {
      await createCard(
        {
          merchantUserId: merchantId,
          name,
          rewardKind: 'nth_free',
          targetVisits: 5,
          rewardText: 'Free dosa',
        },
        handle.db,
      )
    }

    expect(await activeReceivingAddresses(handle.db)).toEqual([receiving])
  })
})
