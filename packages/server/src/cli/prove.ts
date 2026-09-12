import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as sleep } from 'node:timers/promises'
import { KeyPair, PrivateKey } from '@nimiq/core'
import { eq, inArray } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import { config, repoRoot } from '../config.js'
import { createDb, createMemoryDb, type Db, type DbHandle } from '../db/client.js'
import { applyMigrations } from '../db/migrate.js'
import { cards, sessions, stamps, users, type Card } from '../db/schema.js'
import { createCard } from '../domain/cards.js'
import { claimByHash, recordPayment } from '../domain/stamps.js'
import { lunaToNim, getBalance, getBlockNumber, type ChainTransaction } from '../nimiq/rpc.js'
import { sendWithData, waitForInclusion } from '../nimiq/send.js'
import { signWithKeyPair } from '../nimiq/verify.js'
import { tick } from '../watcher/index.js'
import { merchantKeyAddress, seedDemo } from './seed.js'

/** One stamp costs 1 NIM on the demo card, and steps 4 to 6 need one stamp in hand. */
const NEEDED_LUNA = 100000

const HALF_NIM = 50000

const WAIT_FOR_RAM_MS = 5 * 60 * 1000

const skipWait = process.argv.includes('--skip-wait')

type Status = 'PASS' | 'FAIL' | 'SKIPPED'

type Check = { step: number; name: string; status: Status; note: string }

const checks: Check[] = []
const transcript: string[] = []

function say(line = ''): void {
  transcript.push(line)
  console.log(line)
}

function heading(step: number, name: string): void {
  say('')
  say(`${step}. ${name}`)
}

function detail(line: string): void {
  say(`   ${line}`)
}

function record(step: number, name: string, status: Status, note: string): void {
  checks.push({ step, name, status, note })
  say(`   ${status}  ${note}`)
}

/** Each step reports its own result and a thrown error is a FAIL, never the end of the run. */
async function step(number: number, name: string, body: () => Promise<[Status, string]>): Promise<Status> {
  heading(number, name)
  try {
    const [status, note] = await body()
    record(number, name, status, note)
    return status
  } catch (error) {
    record(number, name, 'FAIL', `threw: ${errorText(error)}`)
    return 'FAIL'
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function randomHash(): string {
  return randomBytes(32).toString('hex')
}

function addressOf(keyPair: KeyPair): string {
  return keyPair.toAddress().toUserFriendlyAddress().replace(/\s+/g, '')
}

function stamped(text: string): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  return `${text}-${day}-${pad(now.getHours())}${pad(now.getMinutes())}`
}

/** Temporary cards and users the live attacks need, removed again before the run ends. */
const temporary = { cardIds: [] as string[], userIds: [] as string[] }

async function temporaryCard(database: Db, merchantUserId: string, name: string): Promise<Card> {
  const card = await createCard(
    {
      merchantUserId,
      name,
      rewardKind: 'nth_free',
      targetVisits: 3,
      rewardText: 'Free coffee',
      minLuna: NEEDED_LUNA,
    },
    database,
  )
  temporary.cardIds.push(card.id)
  return card
}

async function temporaryUser(database: Db, visibleAddress: string): Promise<string> {
  const [row] = await database.insert(users).values({ visibleAddress }).returning({ id: users.id })
  if (!row) throw new Error('could not create a throwaway user')
  temporary.userIds.push(row.id)
  return row.id
}

async function removeTemporary(database: Db): Promise<void> {
  if (temporary.cardIds.length > 0) {
    await database.delete(stamps).where(inArray(stamps.cardId, temporary.cardIds))
    await database.delete(cards).where(inArray(cards.id, temporary.cardIds))
  }
  if (temporary.userIds.length > 0) {
    // A throwaway merchant that signed in left a session behind, and a session points at
    // the user, so the session goes first or the delete below is refused.
    await database.delete(sessions).where(inArray(sessions.userId, temporary.userIds))
    await database.delete(users).where(inArray(users.id, temporary.userIds))
  }
}

/** Sends and waits, so a step that needs a confirmed payment cannot read a mempool ghost. */
async function payAndWait(
  keyPair: KeyPair,
  recipient: string,
  valueLuna: number,
  data: string,
): Promise<ChainTransaction> {
  const hash = await sendWithData({ keyPair, recipient, valueLuna, data })
  detail(`sent ${lunaToNim(valueLuna)} NIM, hash ${hash}`)

  const included = await waitForInclusion(hash, 90000)
  if (!included) throw new Error(`transaction ${hash} did not reach a block in 90 seconds`)

  detail(`included in block ${included.blockNumber}`)
  return included
}

type SignedIn = { auth: { authorization: string }; address: string }

async function signIn(app: FastifyInstance, keyPair: KeyPair, remoteAddress?: string): Promise<SignedIn> {
  const challenge = await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {} })
  const { message } = challenge.json<{ message: string }>()
  const signed = signWithKeyPair(keyPair, message)

  const verified = await app.inject({
    method: 'POST',
    url: '/api/auth/verify',
    payload: {
      message,
      publicKey: signed.publicKey,
      signature: signed.signature,
      visibleAddress: addressOf(keyPair),
      ...(remoteAddress ? { remoteAddress } : {}),
    },
  })

  if (verified.statusCode !== 200) throw new Error(`sign in failed: ${verified.body}`)

  const body = verified.json<{ token: string }>()
  return { auth: { authorization: `Bearer ${body.token}` }, address: addressOf(keyPair) }
}

async function main(): Promise<void> {
  say(`Vango prove-it, ${new Date().toISOString()}`)
  say('Every step below either proves the product works or shows an attack being refused.')

  const merchantKey = KeyPair.derive(PrivateKey.fromHex(config.SPIKE_MERCHANT_PRIVATE_KEY))
  const merchantAddress = merchantKeyAddress()

  // The steps fill this in as they go. A plain `let` would be narrowed to null by the
  // compiler, because every assignment happens inside a step's callback.
  const state: {
    handle: DbHandle | null
    database: Db | null
    card: Card | null
    memo: string
    merchantUserId: string
    stampedHash: string | null
  } = { handle: null, database: null, card: null, memo: '', merchantUserId: '', stampedHash: null }

  await step(1, 'Boot: database, migrations and the live chain', async () => {
    const handle = createDb()
    state.handle = handle
    const migrations = await applyMigrations(handle)
    state.database = handle.db

    const head = await getBlockNumber()

    detail(`database   ${handle.kind}`)
    detail(`migrations ${migrations.applied.length} applied, ${migrations.alreadyApplied.length} already there`)
    detail(`network    ${config.NIMIQ_NETWORK}`)
    detail(`rpc        ${config.NIMIQ_RPC_URL}`)
    detail(`block      ${head}`)

    if (head <= 0) return ['FAIL', 'the node did not give a block height']
    return ['PASS', `connected to ${config.NIMIQ_NETWORK} at block ${head}`]
  })

  const live = state.database
  if (!live) {
    say('')
    say('The database did not open, so nothing below can run. If the API server is running,')
    say('stop it first: the local PGlite database takes one process at a time.')
    finish()
    return
  }

  await step(2, 'Seed: the demo merchant and their card', async () => {
    const seeded = await seedDemo(live)
    state.card = seeded.card
    state.memo = seeded.memo
    state.merchantUserId = seeded.merchant.id

    detail(`card    ${seeded.card.name} (${seeded.created ? 'created now' : 'already there'})`)
    detail(`code    ${seeded.card.code}`)
    detail(`reward  ${seeded.card.rewardText} on visit ${seeded.card.targetVisits}`)
    detail(`pay to  ${seeded.card.receivingAddress}`)
    detail(`memo    ${seeded.memo}`)

    return ['PASS', `demo card ${seeded.card.code} ready`]
  })

  const card = state.card
  if (!card) {
    say('')
    say('Without the demo card the rest of the run has nothing to point at.')
    finish()
    return
  }

  await step(3, 'A real payment from a phone becomes a stamp', async () => {
    if (skipWait) return ['SKIPPED', 'started with --skip-wait, no phone payment was waited for']

    detail(`Pay 1 NIM from Nimiq Pay (testnet) to ${card.receivingAddress} with memo ${state.memo},`)
    detail('or press Enter to skip')

    const before = new Set(
      (await live.select({ hash: stamps.txHash }).from(stamps).where(eq(stamps.cardId, card.id))).map(
        (row) => row.hash,
      ),
    )

    let pressedEnter = false
    const keyboard = createInterface({ input: process.stdin })
    keyboard.once('line', () => {
      pressedEnter = true
    })

    const deadline = Date.now() + WAIT_FOR_RAM_MS
    let found: { hash: string; block: number; sender: string } | null = null

    try {
      while (!pressedEnter && Date.now() < deadline && !found) {
        await tick({ database: live, log: () => undefined })

        const rows = await live
          .select({ hash: stamps.txHash, block: stamps.blockNumber, sender: stamps.senderAddress })
          .from(stamps)
          .where(eq(stamps.cardId, card.id))

        const fresh = rows.find((row) => !before.has(row.hash))
        if (fresh) found = fresh
        else await sleep(3000)
      }
    } finally {
      keyboard.close()
      process.stdin.pause()
    }

    if (!found) {
      return ['SKIPPED', pressedEnter ? 'skipped at the keyboard' : 'no payment arrived within five minutes']
    }

    state.stampedHash = found.hash
    detail(`hash   ${found.hash}`)
    detail(`block  ${found.block}`)
    detail(`sender ${found.sender}`)
    return ['PASS', 'a live payment was read off the chain and stamped']
  })

  const balance = await getBalance(merchantAddress).catch(() => 0)
  const funded = balance >= NEEDED_LUNA

  if (!funded) {
    say('')
    say(`The merchant wallet ${merchantAddress} holds ${lunaToNim(balance)} NIM.`)
    say(`Steps 4 to 6 move ${lunaToNim(NEEDED_LUNA)} NIM around and hand it back, so they need`)
    say(`${lunaToNim(NEEDED_LUNA - balance)} NIM more from the testnet faucet.`)
  }

  // The throwaway merchant of step 4: the wallet they sign in with, and the remote account
  // Nimiq Pay spends from on their behalf.
  const proveMerchantKey = KeyPair.generate()
  const proveRemoteKey = KeyPair.generate()
  const secondMerchantKey = KeyPair.generate()
  const payerKey = KeyPair.generate()

  await step(4, 'Attack: the merchant pays their own counter to farm stamps', async () => {
    if (!funded) return ['SKIPPED', `merchant wallet is short ${lunaToNim(NEEDED_LUNA - balance)} NIM`]

    // A card is always paid into its owner's visible address, and Nimiq refuses a payment
    // whose sender is its own recipient, so a merchant cannot reach their own counter from
    // that wallet at all. What is left to test is the account Nimiq Pay actually spends
    // from: a throwaway merchant signs in, recording that remote account, opens a counter,
    // and pays it out of the remote account.
    const liveApp = await buildApp({
      database: live,
      logger: false,
      rateLimit: { global: 100000, auth: 100000, redeem: 100000 },
    })

    try {
      const owner = await signIn(liveApp, proveMerchantKey, addressOf(proveRemoteKey))

      const [ownerRow] = await live
        .select({ id: users.id })
        .from(users)
        .where(eq(users.visibleAddress, owner.address))
        .limit(1)
      if (!ownerRow) return ['FAIL', 'the throwaway merchant did not reach the database']
      temporary.userIds.push(ownerRow.id)

      const opened = await liveApp.inject({
        method: 'POST',
        url: '/api/cards',
        headers: owner.auth,
        payload: {
          name: 'Vango Prove Counter',
          rewardKind: 'nth_free',
          targetVisits: 3,
          rewardText: 'Free coffee',
        },
      })
      if (opened.statusCode !== 201) return ['FAIL', `the throwaway counter was not opened: ${opened.body}`]

      const counter = opened.json<{ code: string; receivingAddress: string }>()
      const [counterRow] = await live
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.code, counter.code))
        .limit(1)
      if (counterRow) temporary.cardIds.push(counterRow.id)

      detail(`counter card ${counter.code} pays into ${counter.receivingAddress}`)
      detail(`its owner's remote account, recorded at login, is ${addressOf(proveRemoteKey)}`)

      await payAndWait(
        merchantKey,
        addressOf(proveRemoteKey),
        NEEDED_LUNA,
        'vango-prove: funding the remote account',
      )
      const paid = await payAndWait(
        proveRemoteKey,
        counter.receivingAddress,
        NEEDED_LUNA,
        `vango:${counter.code}`,
      )
      const result = await recordPayment(paid, live)
      detail(`engine says ${JSON.stringify(result)}`)

      const back = await payAndWait(
        proveMerchantKey,
        merchantAddress,
        NEEDED_LUNA,
        'vango-prove: returning the test NIM',
      )
      detail(`test NIM returned to the merchant in block ${back.blockNumber}`)

      if (result.stamped || result.reason !== 'sender is merchant') {
        return ['FAIL', `expected "sender is merchant", got ${JSON.stringify(result)}`]
      }
      return ['PASS', 'refused: sender is merchant']
    } finally {
      await liveApp.close()
    }
  })

  await step(5, 'Attack: the same payment claimed twice', async () => {
    if (state.stampedHash) {
      const first = await claimByHash(state.stampedHash, { database: live })
      const second = await claimByHash(state.stampedHash, { database: live })
      detail(`first claim  ${JSON.stringify(first)}`)
      detail(`second claim ${JSON.stringify(second)}`)
      if (second.stamped || second.reason !== 'already stamped') {
        return ['FAIL', `expected "already stamped", got ${JSON.stringify(second)}`]
      }
      return ['PASS', 'refused: already stamped']
    }

    if (!funded) return ['SKIPPED', `merchant wallet is short ${lunaToNim(NEEDED_LUNA - balance)} NIM`]

    const secondMerchantId = await temporaryUser(live, addressOf(secondMerchantKey))
    const secondCard = await temporaryCard(live, secondMerchantId, 'Vango Prove Cafe')
    detail(`second card ${secondCard.code} pays into ${secondCard.receivingAddress}`)

    await payAndWait(merchantKey, addressOf(payerKey), NEEDED_LUNA, 'vango-prove: funding a customer')
    const payment = await payAndWait(
      payerKey,
      secondCard.receivingAddress,
      NEEDED_LUNA,
      `vango:${secondCard.code}`,
    )

    const first = await claimByHash(payment.hash, { database: live })
    const second = await claimByHash(payment.hash, { database: live })
    detail(`first claim  ${JSON.stringify(first)}`)
    detail(`second claim ${JSON.stringify(second)}`)

    if (!first.stamped) return ['FAIL', `the real payment was not stamped: ${JSON.stringify(first)}`]
    if (second.stamped || second.reason !== 'already stamped') {
      return ['FAIL', `expected "already stamped", got ${JSON.stringify(second)}`]
    }
    return ['PASS', 'refused: already stamped']
  })

  await step(6, 'Attack: a payment under the card minimum', async () => {
    if (!funded) return ['SKIPPED', `merchant wallet is short ${lunaToNim(NEEDED_LUNA - balance)} NIM`]

    // The wallet that was paid in step 5 still holds the test NIM, so the small payment
    // and the sweep that hands it back both come out of it.
    const payer = state.stampedHash ? payerKey : secondMerchantKey
    if (state.stampedHash) await payAndWait(merchantKey, addressOf(payer), HALF_NIM, 'vango-prove: funding a customer')

    const small = await payAndWait(payer, card.receivingAddress, HALF_NIM, state.memo)
    const result = await claimByHash(small.hash, { database: live })
    detail(`engine says ${JSON.stringify(result)}`)

    if (result.stamped || result.reason !== 'below minimum') {
      return ['FAIL', `expected "below minimum", got ${JSON.stringify(result)}`]
    }
    return ['PASS', 'refused: below minimum']
  })

  // Whatever the steps above did, and whichever of them failed halfway, the test NIM goes
  // home. A run that stranded half a NIM in a throwaway key would only work once.
  if (funded) {
    say('')
    for (const key of [proveMerchantKey, proveRemoteKey, secondMerchantKey, payerKey]) {
      const left = await getBalance(addressOf(key)).catch(() => 0)
      if (left <= 0) continue
      try {
        const swept = await payAndWait(key, merchantAddress, left, 'vango-prove: returning the test NIM')
        say(`swept ${lunaToNim(left)} NIM back to the merchant in block ${swept.blockNumber}`)
      } catch (error) {
        say(`could not sweep ${lunaToNim(left)} NIM from ${addressOf(key)}: ${errorText(error)}`)
      }
    }
  }

  await removeTemporary(live).catch((error: unknown) => {
    say(`could not remove the temporary cards: ${errorText(error)}`)
  })

  if (funded) {
    const after = await getBalance(merchantAddress).catch(() => 0)
    say('')
    say(`Merchant wallet before the attacks ${lunaToNim(balance)} NIM, after ${lunaToNim(after)} NIM.`)
    say('Nimiq fees are zero and every test payment is handed back, so the run repeats.')
  }

  const memory = createMemoryDb()
  await applyMigrations(memory)

  const fakeChain = new Map<string, ChainTransaction>()
  const app = await buildApp({
    database: memory.db,
    logger: false,
    rateLimit: { global: 100000, auth: 100000, redeem: 100000 },
    fetchTransaction: async (hash: string) => fakeChain.get(hash) ?? null,
  })

  await step(7, 'Attack: a login signature sent twice', async () => {
    const keyPair = KeyPair.generate()
    const challenge = await app.inject({ method: 'POST', url: '/api/auth/challenge', payload: {} })
    const { message } = challenge.json<{ message: string }>()
    const signed = signWithKeyPair(keyPair, message)

    const body = {
      message,
      publicKey: signed.publicKey,
      signature: signed.signature,
      visibleAddress: addressOf(keyPair),
    }

    const first = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: body })
    const replay = await app.inject({ method: 'POST', url: '/api/auth/verify', payload: body })

    detail(`first send  ${first.statusCode}`)
    detail(`replay      ${replay.statusCode} ${replay.body}`)

    if (first.statusCode !== 200) return ['FAIL', `the honest login failed: ${first.body}`]
    if (replay.statusCode !== 401) return ['FAIL', `replay answered ${replay.statusCode}, wanted 401`]
    if (!replay.json<{ error: string }>().error.includes('nonce')) {
      return ['FAIL', `replay was refused, but not over the nonce: ${replay.body}`]
    }
    return ['PASS', 'refused: 401 nonce used']
  })

  const merchantApp = await signIn(app, KeyPair.generate())

  async function openCard(rule: Record<string, unknown>): Promise<{ code: string; receiving: string }> {
    const created = await app.inject({
      method: 'POST',
      url: '/api/cards',
      headers: merchantApp.auth,
      payload: { name: 'Vango Demo Cafe', ...rule },
    })

    if (created.statusCode !== 201) throw new Error(`card not opened: ${created.body}`)
    const card = created.json<{ code: string; receivingAddress: string }>()
    return { code: card.code, receiving: card.receivingAddress }
  }

  async function fakeStamp(
    customer: { auth: { authorization: string } },
    code: string,
    receiving: string,
    sender: string,
    valueLuna: number,
  ): Promise<void> {
    const tx: ChainTransaction = {
      hash: randomHash(),
      blockNumber: 11_148_228,
      sender,
      recipient: receiving,
      valueLuna,
      memo: `vango:${code}`,
    }
    fakeChain.set(tx.hash, tx)

    const claimed = await app.inject({
      method: 'POST',
      url: '/api/stamps/claim',
      headers: customer.auth,
      payload: { hash: tx.hash },
    })

    if (claimed.statusCode !== 200) throw new Error(`stamp not claimed: ${claimed.body}`)
  }

  async function signReward(customerKey: KeyPair, customer: SignedIn, code: string): Promise<string> {
    const started = await app.inject({
      method: 'POST',
      url: '/api/redeem/start',
      headers: customer.auth,
      payload: { code },
    })
    if (started.statusCode !== 200) throw new Error(`start refused: ${started.body}`)

    const { message } = started.json<{ message: string }>()
    const signed = signWithKeyPair(customerKey, message)

    const signedReward = await app.inject({
      method: 'POST',
      url: '/api/redeem/sign',
      headers: customer.auth,
      payload: { message, publicKey: signed.publicKey, signature: signed.signature },
    })
    if (signedReward.statusCode !== 200) throw new Error(`sign refused: ${signedReward.body}`)

    return signedReward.json<{ token: string }>().token
  }

  await step(8, 'Attack: taking the reward before the card is full', async () => {
    const nthFree = await openCard({ rewardKind: 'nth_free', targetVisits: 3, rewardText: 'Free coffee' })
    const customerKey = KeyPair.generate()
    const customer = await signIn(app, customerKey)

    await fakeStamp(customer, nthFree.code, nthFree.receiving, customer.address, NEEDED_LUNA)

    const started = await app.inject({
      method: 'POST',
      url: '/api/redeem/start',
      headers: customer.auth,
      payload: { code: nthFree.code },
    })

    detail(`one stamp of three, start says ${started.statusCode} ${started.body}`)

    if (started.statusCode !== 409) return ['FAIL', `start answered ${started.statusCode}, wanted 409`]
    if (started.json<{ error: string }>().error !== 'not redeemable yet') {
      return ['FAIL', `wrong reason: ${started.body}`]
    }
    return ['PASS', 'refused: 409 not redeemable yet']
  })

  await step(9, "Attack: a stranger confirming another merchant's reward", async () => {
    const nthFree = await openCard({ rewardKind: 'nth_free', targetVisits: 3, rewardText: 'Free coffee' })
    const customerKey = KeyPair.generate()
    const customer = await signIn(app, customerKey)

    for (let visit = 0; visit < 3; visit += 1) {
      await fakeStamp(customer, nthFree.code, nthFree.receiving, customer.address, NEEDED_LUNA)
    }

    const token = await signReward(customerKey, customer, nthFree.code)
    const stranger = await signIn(app, KeyPair.generate())

    const peeked = await app.inject({
      method: 'GET',
      url: `/api/redeem/${token}`,
      headers: stranger.auth,
    })
    const stolen = await app.inject({
      method: 'POST',
      url: `/api/redeem/${token}/confirm`,
      headers: stranger.auth,
    })
    const owner = await app.inject({
      method: 'POST',
      url: `/api/redeem/${token}/confirm`,
      headers: merchantApp.auth,
    })

    detail(`stranger reads   ${peeked.statusCode} ${peeked.body}`)
    detail(`stranger confirms ${stolen.statusCode} ${stolen.body}`)
    detail(`owner confirms   ${owner.statusCode} ${owner.body}`)

    if (peeked.statusCode !== 404 || stolen.statusCode !== 404) {
      return ['FAIL', `stranger got ${peeked.statusCode} and ${stolen.statusCode}, wanted 404 and 404`]
    }
    if (owner.statusCode !== 200) return ['FAIL', `the real merchant was blocked too: ${owner.body}`]
    return ['PASS', 'refused: 404 reward not found, and the real merchant still confirms']
  })

  await step(10, "Attack: settling cashback with a stranger's payment", async () => {
    const cashback = await openCard({ rewardKind: 'cashback', cashbackBps: 200, rewardText: '2% back in NIM' })
    const customerKey = KeyPair.generate()
    const customer = await signIn(app, customerKey)

    await fakeStamp(customer, cashback.code, cashback.receiving, customer.address, 1_000_000)

    const token = await signReward(customerKey, customer, cashback.code)
    const confirmed = await app.inject({
      method: 'POST',
      url: `/api/redeem/${token}/confirm`,
      headers: merchantApp.auth,
    })
    if (confirmed.statusCode !== 200) return ['FAIL', `confirm refused: ${confirmed.body}`]

    const owed = confirmed.json<{ amountLuna: number }>().amountLuna
    const strangersPayment: ChainTransaction = {
      hash: randomHash(),
      blockNumber: 11_148_400,
      sender: addressOf(KeyPair.generate()),
      recipient: customer.address,
      valueLuna: owed,
      memo: null,
    }
    fakeChain.set(strangersPayment.hash, strangersPayment)

    const settled = await app.inject({
      method: 'POST',
      url: `/api/redeem/${token}/paid`,
      headers: merchantApp.auth,
      payload: { hash: strangersPayment.hash },
    })

    detail(`owed ${owed} Luna, a stranger paid it, server says ${settled.statusCode} ${settled.body}`)

    if (settled.statusCode !== 409) return ['FAIL', `settle answered ${settled.statusCode}, wanted 409`]
    if (settled.json<{ error: string }>().error !== 'payment did not come from the merchant') {
      return ['FAIL', `wrong reason: ${settled.body}`]
    }
    return ['PASS', 'refused: 409 payment did not come from the merchant']
  })

  await app.close()
  await memory.close()
  if (state.handle) await state.handle.close()

  finish()
}

function finish(): void {
  const passed = checks.filter((check) => check.status === 'PASS').length
  const skipped = checks.filter((check) => check.status === 'SKIPPED').length
  const failed = checks.filter((check) => check.status === 'FAIL').length

  say('')
  say('11. Summary')
  say('   step  result   check')
  for (const check of checks) {
    say(`   ${String(check.step).padStart(4)}  ${check.status.padEnd(8)} ${check.name}`)
  }
  say('')
  say(`prove-it finished, ${passed} of ${checks.length} checks passed`)
  if (skipped > 0) say(`${skipped} skipped, ${failed} failed`)
  else if (failed > 0) say(`${failed} failed`)

  const folder = resolve(repoRoot, 'docs/proofs')
  mkdirSync(folder, { recursive: true })
  const file = resolve(folder, `${stamped('prove')}.txt`)
  writeFileSync(file, `${transcript.join('\n')}\n`, 'utf8')

  console.log(`saved to ${file}`)

  process.exit(failed > 0 ? 1 : 0)
}

await main()
