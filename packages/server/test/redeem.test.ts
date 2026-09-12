// Covers taking a reward end to end: the customer signs, the merchant confirms, and
// cashback is settled against a payment read back off the chain. It does NOT reach a
// real node (payments are served by a fake), it does NOT cover two merchants' phones
// confirming the same reward at the same instant, and it does NOT cover the wallet
// dialog on the phone.

import { KeyPair } from '@nimiq/core'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { DbHandle } from '../src/db/client.js'
import { redemptions } from '../src/db/schema.js'
import { buildRedeemMessage, parseLoginMessage, parseRedeemMessage } from '../src/domain/challenges.js'
import { expireRedemptions } from '../src/domain/redemptions.js'
import { formatAddress } from '../src/lib/address.js'
import type { ChainTransaction } from '../src/nimiq/rpc.js'
import {
  addressOf,
  fakeFetch,
  signChallenge,
  signIn,
  testApp,
  type FakeChain,
  type SignedIn,
} from './support/api.js'
import { clearTables, freshDb, randomAddress, randomHash } from './support/db.js'

const chain: FakeChain = new Map()

let handle: DbHandle
let app: FastifyInstance
let merchantKey: KeyPair
let customerKey: KeyPair
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

  merchantKey = KeyPair.generate()
  customerKey = KeyPair.generate()
  customerRemote = randomAddress()

  merchant = await signIn(app, merchantKey)
  receiving = merchant.visibleAddress
  customer = await signIn(app, customerKey, { remoteAddress: customerRemote })
  code = await openCard({ rewardKind: 'nth_free', targetVisits: 3, rewardText: 'Free filter coffee' })
})

async function openCard(rule: Record<string, unknown>): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/cards',
    headers: merchant.auth,
    payload: { name: 'Kumar Coffee', ...rule },
  })
  if (created.statusCode !== 201) throw new Error(`card not opened: ${created.body}`)
  return created.json<{ code: string }>().code
}

/** One real payment into the card, claimed the way the phone claims it. */
async function stamp(cardCode: string, valueLuna = 100000): Promise<void> {
  const tx: ChainTransaction = {
    hash: randomHash(),
    blockNumber: 11_148_228,
    sender: customerRemote,
    recipient: receiving,
    valueLuna,
    memo: `vango:${cardCode}`,
  }
  chain.set(tx.hash, tx)

  const claimed = await app.inject({
    method: 'POST',
    url: '/api/stamps/claim',
    headers: customer.auth,
    payload: { hash: tx.hash },
  })
  if (claimed.statusCode !== 200) throw new Error(`stamp not claimed: ${claimed.body}`)
}

type SignedReward = { token: string; code6: string; reward: { cashbackLuna?: number } }

async function startAndSign(cardCode: string): Promise<SignedReward> {
  const started = await app.inject({
    method: 'POST',
    url: '/api/redeem/start',
    headers: customer.auth,
    payload: { code: cardCode },
  })
  if (started.statusCode !== 200) throw new Error(`start refused: ${started.body}`)

  const { message } = started.json<{ message: string }>()
  const signed = await app.inject({
    method: 'POST',
    url: '/api/redeem/sign',
    headers: customer.auth,
    payload: signChallenge(customerKey, message),
  })
  if (signed.statusCode !== 200) throw new Error(`sign refused: ${signed.body}`)

  return signed.json<SignedReward>()
}

function heldProgress(body: { held: { code: string; progress: Record<string, number | boolean> }[] }, wanted: string) {
  return body.held.find((card) => card.code === wanted)?.progress
}

async function wallet(): Promise<{ held: { code: string; progress: Record<string, number | boolean> }[] }> {
  const response = await app.inject({ method: 'GET', url: '/api/wallet', headers: customer.auth })
  return response.json()
}

describe('nth_free redemption', () => {
  it('redeems a full card and confirms it as the merchant', async () => {
    for (let i = 0; i < 3; i += 1) await stamp(code)

    const reward = await startAndSign(code)
    expect(reward.token).toMatch(/^vr1\.[0-9a-f]{32}$/)
    expect(reward.code6).toMatch(/^\d{6}$/)

    const scanned = await app.inject({
      method: 'GET',
      url: `/api/redeem/${reward.token}`,
      headers: merchant.auth,
    })
    const typed = await app.inject({
      method: 'GET',
      url: `/api/redeem/${reward.code6}`,
      headers: merchant.auth,
    })

    expect(scanned.statusCode).toBe(200)
    expect(scanned.json()).toMatchObject({
      status: 'pending',
      cardName: 'Kumar Coffee',
      rewardText: 'Free filter coffee',
      rewardKind: 'nth_free',
      stampsConsumed: 3,
      cashbackLuna: 0,
    })
    expect(scanned.json<{ customer: string }>().customer).toContain('...')
    expect(scanned.json<{ customer: string }>().customer).not.toBe(addressOf(customerKey))
    expect(typed.json()).toMatchObject({ status: 'pending', stampsConsumed: 3 })

    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: merchant.auth,
    })

    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.json()).toEqual({ status: 'confirmed' })
    expect(heldProgress(await wallet(), code)).toMatchObject({ stamps: 0, redeemable: false })

    const twice = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: merchant.auth,
    })
    expect(twice.statusCode).toBe(409)
  })

  it('refuses to redeem a card that is not full', async () => {
    await stamp(code)
    await stamp(code)

    const started = await app.inject({
      method: 'POST',
      url: '/api/redeem/start',
      headers: customer.auth,
      payload: { code },
    })

    expect(started.statusCode).toBe(409)
    expect(started.json()).toMatchObject({
      error: 'not redeemable yet',
      progress: { stamps: 2, target: 3, redeemable: false },
    })
    expect(await handle.db.select().from(redemptions)).toHaveLength(0)
  })

  it('refuses a replayed redemption signature', async () => {
    for (let i = 0; i < 3; i += 1) await stamp(code)

    const started = await app.inject({
      method: 'POST',
      url: '/api/redeem/start',
      headers: customer.auth,
      payload: { code },
    })
    const payload = signChallenge(customerKey, started.json<{ message: string }>().message)

    const first = await app.inject({
      method: 'POST',
      url: '/api/redeem/sign',
      headers: customer.auth,
      payload,
    })
    const replay = await app.inject({
      method: 'POST',
      url: '/api/redeem/sign',
      headers: customer.auth,
      payload,
    })

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(401)
    expect(replay.json()).toEqual({ error: 'nonce used' })
    expect(await handle.db.select().from(redemptions)).toHaveLength(1)
  })

  it("refuses a merchant confirming another merchant's redemption", async () => {
    for (let i = 0; i < 3; i += 1) await stamp(code)
    const reward = await startAndSign(code)

    const stranger = await signIn(app, KeyPair.generate())

    const peeked = await app.inject({
      method: 'GET',
      url: `/api/redeem/${reward.token}`,
      headers: stranger.auth,
    })
    const stolen = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: stranger.auth,
    })

    expect(peeked.statusCode).toBe(404)
    expect(stolen.statusCode).toBe(404)
    expect(stolen.json()).toEqual({ error: 'reward not found' })

    const owner = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: merchant.auth,
    })
    expect(owner.statusCode).toBe(200)
  })

  it('a login nonce cannot be spent as a redeem nonce', async () => {
    for (let i = 0; i < 3; i += 1) await stamp(code)

    const challenge = await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {} })
    const login = parseLoginMessage(challenge.json<{ message: string }>().message)
    if (!login) throw new Error('the login challenge did not parse')

    const dressedAsRedeem = buildRedeemMessage(code, login.nonce, login.expiresAt)
    const refused = await app.inject({
      method: 'POST',
      url: '/api/redeem/sign',
      headers: customer.auth,
      payload: signChallenge(customerKey, dressedAsRedeem),
    })

    expect(refused.statusCode).toBe(401)
    expect(refused.json()).toEqual({ error: 'nonce unknown' })
    expect(await handle.db.select().from(redemptions)).toHaveLength(0)
  })

  it('a redeem nonce for one card cannot open another card', async () => {
    const otherCode = await openCard({
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free filter coffee',
    })
    for (let i = 0; i < 3; i += 1) await stamp(code)
    for (let i = 0; i < 3; i += 1) await stamp(otherCode)

    const started = await app.inject({
      method: 'POST',
      url: '/api/redeem/start',
      headers: customer.auth,
      payload: { code },
    })
    const issued = parseRedeemMessage(started.json<{ message: string }>().message)
    if (!issued) throw new Error('the redeem challenge did not parse')

    // Both cards are full, so the only thing wrong with this signature is which card the
    // nonce was issued for.
    const swapped = buildRedeemMessage(otherCode, issued.nonce, issued.expiresAt)
    const refused = await app.inject({
      method: 'POST',
      url: '/api/redeem/sign',
      headers: customer.auth,
      payload: signChallenge(customerKey, swapped),
    })

    expect(refused.statusCode).toBe(401)
    expect(refused.json()).toEqual({ error: 'nonce unknown' })
    expect(await handle.db.select().from(redemptions)).toHaveLength(0)
  })

  it('expires a pending redemption after ten minutes', async () => {
    for (let i = 0; i < 3; i += 1) await stamp(code)
    const reward = await startAndSign(code)

    const eleven = new Date(Date.now() - 60_000)
    await handle.db.update(redemptions).set({ expiresAt: eleven }).where(eq(redemptions.status, 'pending'))

    const scanned = await app.inject({
      method: 'GET',
      url: `/api/redeem/${reward.token}`,
      headers: merchant.auth,
    })
    const tooLate = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: merchant.auth,
    })

    expect(scanned.json<{ status: string }>().status).toBe('cancelled')
    expect(tooLate.statusCode).toBe(409)
    expect(tooLate.json()).toEqual({ error: 'this reward expired before it was confirmed' })

    expect(await expireRedemptions(handle.db)).toBe(1)
    const [row] = await handle.db.select().from(redemptions)
    expect(row?.status).toBe('cancelled')

    // The stamps were never spent, so the customer can ask again.
    expect(heldProgress(await wallet(), code)).toMatchObject({ stamps: 3, redeemable: true })
  })
})

describe('cashback redemption', () => {
  let cashbackCode: string

  beforeEach(async () => {
    cashbackCode = await openCard({ rewardKind: 'cashback', cashbackBps: 200, rewardText: '2% back in NIM' })
  })

  function payout(amountLuna: number, changes: Partial<ChainTransaction> = {}): string {
    const tx: ChainTransaction = {
      hash: randomHash(),
      blockNumber: 11_148_300,
      sender: addressOf(merchantKey),
      recipient: addressOf(customerKey),
      valueLuna: amountLuna,
      memo: null,
      ...changes,
    }
    chain.set(tx.hash, tx)
    return tx.hash
  }

  async function confirmCashback(): Promise<{ token: string; amountLuna: number; payTo: string }> {
    const reward = await startAndSign(cashbackCode)
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/confirm`,
      headers: merchant.auth,
    })
    if (confirmed.statusCode !== 200) throw new Error(`confirm refused: ${confirmed.body}`)
    const body = confirmed.json<{ payTo: string; amountLuna: number; memo: string }>()
    expect(body.memo).toBe(`vango-cashback:${reward.code6}`)
    return { token: reward.token, amountLuna: body.amountLuna, payTo: body.payTo }
  }

  it('cashback settles once and the same hash cannot settle twice', async () => {
    await stamp(cashbackCode, 1_000_000)
    const first = await confirmCashback()
    expect(first).toMatchObject({ amountLuna: 20_000, payTo: addressOf(customerKey) })

    const hash = payout(20_000)
    const paid = await app.inject({
      method: 'POST',
      url: `/api/redeem/${first.token}/paid`,
      headers: merchant.auth,
      payload: { hash },
    })

    expect(paid.statusCode).toBe(200)
    expect(paid.json()).toEqual({ status: 'confirmed', cashbackTxHash: hash })

    const again = await app.inject({
      method: 'POST',
      url: `/api/redeem/${first.token}/paid`,
      headers: merchant.auth,
      payload: { hash },
    })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toEqual({ error: 'this reward was already paid' })

    await stamp(cashbackCode, 1_000_000)
    const second = await confirmCashback()
    const reused = await app.inject({
      method: 'POST',
      url: `/api/redeem/${second.token}/paid`,
      headers: merchant.auth,
      payload: { hash },
    })

    expect(reused.statusCode).toBe(409)
    expect(reused.json()).toEqual({ error: 'that payment already settled another reward' })
  })

  it('cashback owed goes down after a confirmed payout', async () => {
    await stamp(cashbackCode, 1_000_000)
    expect(heldProgress(await wallet(), cashbackCode)).toMatchObject({
      totalLuna: 1_000_000,
      cashbackLuna: 20_000,
      redeemable: true,
    })

    await confirmCashback()

    expect(heldProgress(await wallet(), cashbackCode)).toMatchObject({
      totalLuna: 1_000_000,
      cashbackLuna: 0,
      redeemable: false,
    })

    await stamp(cashbackCode, 500_000)

    expect(heldProgress(await wallet(), cashbackCode)).toMatchObject({
      totalLuna: 1_500_000,
      cashbackLuna: 10_000,
      redeemable: true,
    })
  })

  it('refuses a cashback payment that did not come from the merchant', async () => {
    await stamp(cashbackCode, 1_000_000)
    const reward = await confirmCashback()

    const stranger = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(20_000, { sender: randomAddress() }) },
    })

    expect(stranger.statusCode).toBe(409)
    expect(stranger.json()).toEqual({ error: 'payment did not come from the merchant' })

    const owned = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(20_000) },
    })

    expect(owned.statusCode).toBe(200)
  })

  it('cashback recipient check tolerates spaced or lowercase chain addresses', async () => {
    await stamp(cashbackCode, 1_000_000)
    const reward = await confirmCashback()

    // Some nodes hand an address back in its readable form, groups of four with spaces,
    // and a client may lowercase it on the way through.
    const asTheChainWroteIt = formatAddress(addressOf(customerKey)).toLowerCase()
    expect(asTheChainWroteIt).not.toBe(addressOf(customerKey))

    const paid = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(20_000, { recipient: asTheChainWroteIt }) },
    })

    expect(paid.statusCode).toBe(200)
    expect(paid.json<{ status: string }>().status).toBe('confirmed')
  })

  it('refuses a payout that went to the wrong wallet or was too small', async () => {
    await stamp(cashbackCode, 1_000_000)
    const reward = await confirmCashback()

    const wrongWallet = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(20_000, { recipient: randomAddress() }) },
    })
    const tooSmall = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(19_999) },
    })
    const notMined = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: payout(20_000, { blockNumber: 0 }) },
    })
    const unknown = await app.inject({
      method: 'POST',
      url: `/api/redeem/${reward.token}/paid`,
      headers: merchant.auth,
      payload: { hash: randomHash() },
    })

    expect(wrongWallet.json()).toEqual({ error: 'payment did not go to the customer' })
    expect(tooSmall.json()).toEqual({ error: 'payment is smaller than the cashback owed' })
    expect(notMined.json()).toEqual({ error: 'payment is not in a block yet' })
    expect(unknown.json()).toEqual({ error: 'no such payment on chain' })
    expect(wrongWallet.statusCode).toBe(409)
  })
})
