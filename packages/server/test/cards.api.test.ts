// Covers the card routes: opening one, reading one from a sign, and closing one. It
// does NOT cover the stamp engine behind the counts (they are read straight from the
// stamps table here), and it does NOT cover redemption.

import { KeyPair } from '@nimiq/core'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import { signIn, testApp, type SignedIn } from './support/api.js'
import { clearTables, freshDb, randomAddress } from './support/db.js'

let handle: DbHandle
let app: FastifyInstance
let merchant: SignedIn

const newCard = {
  name: 'Kumar Coffee',
  rewardKind: 'nth_free',
  targetVisits: 5,
  rewardText: 'Free filter coffee',
}

beforeAll(async () => {
  handle = await freshDb()
  app = await testApp(handle.db)
}, 60_000)

afterAll(async () => {
  await app.close()
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)
  merchant = await signIn(app, KeyPair.generate())
})

describe('cards', () => {
  it('creates a card and reads it back publicly', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchant.auth,
      payload: newCard,
    })

    expect(created.statusCode).toBe(201)
    const card = created.json<{ code: string; stampCount: number; customerCount: number }>()
    expect(card.code).toMatch(/^[0-9BCDFGHJKMNPQRSTVWXYZ]{8}$/)
    expect(card).toMatchObject({
      stampCount: 0,
      customerCount: 0,
      active: true,
      receivingAddress: merchant.visibleAddress,
    })

    const onTheSign = await app.inject({ method: 'GET', url: `/api/cards/${card.code}` })

    expect(onTheSign.statusCode).toBe(200)
    expect(onTheSign.json()).toMatchObject({
      code: card.code,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 5,
      cashbackBps: null,
      memo: `vango:${card.code}`,
      receivingAddress: merchant.visibleAddress,
      active: true,
    })
  })

  it('refuses a body that names its own receiving address', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchant.auth,
      payload: { ...newCard, receivingAddress: randomAddress() },
    })

    expect(refused.statusCode).toBe(400)
    expect(refused.json<{ error: string }>().error).toContain('receivingAddress')
  })

  it('only the owner can deactivate a card', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchant.auth,
      payload: newCard,
    })
    const { code } = created.json<{ code: string }>()

    const stranger = await signIn(app, KeyPair.generate())
    const refused = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${code}`,
      headers: stranger.auth,
      payload: { active: false },
    })

    expect(refused.statusCode).toBe(403)
    expect(refused.json<{ error: string }>().error).toBe('this card belongs to another merchant')

    const allowed = await app.inject({
      method: 'PATCH',
      url: `/api/cards/${code}`,
      headers: merchant.auth,
      payload: { active: false },
    })

    expect(allowed.statusCode).toBe(200)
    expect(allowed.json<{ active: boolean }>().active).toBe(false)

    const seen = await app.inject({ method: 'GET', url: `/api/cards/${code}` })
    expect(seen.json<{ active: boolean }>().active).toBe(false)
  })

  it('refuses a card whose reward rule is incomplete', async () => {
    const missingTarget = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchant.auth,
      payload: { name: 'Kumar Coffee', rewardKind: 'nth_free', rewardText: 'Free coffee' },
    })

    const badShare = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchant.auth,
      payload: {
        name: 'Anna Barber',
        rewardKind: 'cashback',
        cashbackBps: 9000,
        rewardText: 'Money back',
      },
    })

    expect(missingTarget.statusCode).toBe(400)
    expect(badShare.statusCode).toBe(400)
  })

  it('says nothing about a card code nobody has opened', async () => {
    const unknown = await app.inject({ method: 'GET', url: '/api/cards/NOPE' })
    const shaped = await app.inject({ method: 'GET', url: '/api/cards/9BCDFGHJ' })

    expect(unknown.statusCode).toBe(404)
    expect(shaped.statusCode).toBe(404)
    expect(shaped.json()).toEqual({ error: 'unknown card' })
  })
})
