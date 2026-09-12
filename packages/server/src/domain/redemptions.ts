import { and, eq, gt, isNull, lte } from 'drizzle-orm'
import { db, type Db } from '../db/client.js'
import { isUniqueViolation, uniqueViolationIndex } from '../db/errors.js'
import { cards, redemptions, users, type Card, type Redemption, type User } from '../db/schema.js'
import { comparableAddress, formatAddress } from '../lib/address.js'
import { code6FromTokenHash, hashToken, isCode6, isRedemptionToken, newRedemptionToken } from '../lib/tokens.js'
import { fetchTransaction } from '../nimiq/rpc.js'
import { verifySignedMessage } from '../nimiq/verify.js'
import { consumeChallenge, issueChallenge, parseRedeemMessage } from './challenges.js'
import { progress, type CardProgress } from './stamps.js'

/** A signed reward has ten minutes to reach the merchant's phone before it lapses. */
export const REDEMPTION_TTL_MS = 10 * 60 * 1000

/** How many six-digit codes to try before giving up. A collision needs a second try. */
const CODE6_ATTEMPTS = 8

const ONE_PENDING_INDEX = 'redemptions_one_pending_per_card_customer'

export type RedemptionStatus = 'pending' | 'confirmed' | 'cancelled'

export type RewardOffer = {
  kind: 'nth_free' | 'cashback'
  text: string
  stampsToConsume?: number
  cashbackLuna?: number
}

export type Refusal = { ok: false; status: number; error: string; progress?: CardProgress }

export type StartResult =
  | { ok: true; message: string; nonce: string; expiresAt: number; reward: RewardOffer }
  | Refusal

/** id is for the log only. The token is the secret and never goes near a log line. */
export type SignResult =
  | { ok: true; id: string; token: string; code6: string; expiresAt: string; reward: RewardOffer }
  | Refusal

export type RedemptionView = {
  status: RedemptionStatus
  cardName: string
  rewardText: string
  rewardKind: 'nth_free' | 'cashback'
  customer: string
  stampsConsumed: number
  cashbackLuna: number
  expiresAt: string | null
}

/** payTo, amountLuna and memo are present for a cashback card only. id is for the log. */
export type ConfirmResult =
  | { ok: true; id: string; status: 'confirmed'; payTo?: string; amountLuna?: number; memo?: string }
  | Refusal

export type SettleResult = { ok: true; status: 'confirmed'; cashbackTxHash: string } | Refusal

type Found = { redemption: Redemption; card: Card; customer: User }

function rewardFor(card: Card, cardProgress: CardProgress): RewardOffer {
  if (card.rewardKind === 'cashback') {
    return { kind: 'cashback', text: card.rewardText, cashbackLuna: cardProgress.cashbackLuna }
  }
  return { kind: 'nth_free', text: card.rewardText, stampsToConsume: card.targetVisits ?? 0 }
}

/** What the status really is right now: a pending reward past its ten minutes is gone. */
export function effectiveStatus(redemption: Redemption, now: Date = new Date()): RedemptionStatus {
  const status = redemption.status as RedemptionStatus
  if (status !== 'pending') return status
  if (redemption.expiresAt.getTime() <= now.getTime()) return 'cancelled'
  return status
}

/**
 * Shows the merchant enough of the customer's address to match it against the phone in
 * front of them, with the middle group held back so a screenshot is not a payable address.
 */
export function maskAddress(address: string): string {
  const groups = formatAddress(address).split(' ')
  if (groups.length <= 8) return groups.join(' ')
  return `${groups.slice(0, 4).join(' ')} ... ${groups.slice(-4).join(' ')}`
}

async function livePending(
  cardId: string,
  customerUserId: string,
  database: Db,
  now: Date,
): Promise<Redemption | undefined> {
  const [row] = await database
    .select()
    .from(redemptions)
    .where(
      and(
        eq(redemptions.cardId, cardId),
        eq(redemptions.customerUserId, customerUserId),
        eq(redemptions.status, 'pending'),
        gt(redemptions.expiresAt, now),
      ),
    )
    .limit(1)

  return row
}

/**
 * Step one of taking a reward: the server checks the card is actually full and hands
 * back the exact words the customer's wallet will sign. Nothing is written to the
 * redemption table yet, so an abandoned dialog costs the customer nothing.
 */
export async function startRedemption(
  user: User,
  code: string,
  options: { database?: Db; now?: Date } = {},
): Promise<StartResult> {
  const database = options.database ?? db()
  const now = options.now ?? new Date()

  const [card] = await database.select().from(cards).where(eq(cards.code, code.toUpperCase())).limit(1)
  if (!card) return { ok: false, status: 404, error: 'unknown card' }

  const cardProgress = await progress(card.id, user.id, database)
  if (!cardProgress.redeemable) {
    return { ok: false, status: 409, error: 'not redeemable yet', progress: cardProgress }
  }

  const waiting = await livePending(card.id, user.id, database, now)
  if (waiting) {
    return { ok: false, status: 409, error: 'a reward is already waiting for this card', progress: cardProgress }
  }

  const challenge = await issueChallenge('redeem', card.code, database, now)

  return {
    ok: true,
    message: challenge.message,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt,
    reward: rewardFor(card, cardProgress),
  }
}

/**
 * Step two: the wallet's signature over the challenge becomes a pending reward.
 *
 * The nonce is spent last, after every eligibility check, because spending it is the
 * one thing that cannot be undone: it is what makes a replayed signature fail. Only one
 * reward per card can be waiting at a time, so a customer cannot sign twice and have
 * both honoured.
 */
export async function signRedemption(
  user: User,
  input: { message: string; publicKey: string; signature: string },
  options: { database?: Db; now?: Date } = {},
): Promise<SignResult> {
  const database = options.database ?? db()
  const now = options.now ?? new Date()

  const parsed = parseRedeemMessage(input.message)
  if (!parsed) return { ok: false, status: 400, error: 'message is not a vango redeem challenge' }

  const verified = verifySignedMessage({
    address: user.visibleAddress,
    publicKey: input.publicKey,
    signature: input.signature,
    message: input.message,
  })
  if (!verified.ok) return { ok: false, status: 401, error: verified.reason }

  const [card] = await database.select().from(cards).where(eq(cards.code, parsed.cardCode)).limit(1)
  if (!card) return { ok: false, status: 404, error: 'unknown card' }

  const cardProgress = await progress(card.id, user.id, database)
  if (!cardProgress.redeemable) {
    return { ok: false, status: 409, error: 'not redeemable yet', progress: cardProgress }
  }

  // The nonce is spent before the "already waiting" check so a signature sent twice is
  // always answered with "nonce used", which is the honest reason and the one a client
  // can act on. A second challenge signed while one reward is still open is caught by
  // the check below instead.
  const claimed = await consumeChallenge(parsed.nonce, 'redeem', card.code, database, now)
  if (!claimed.ok) return { ok: false, status: 401, error: claimed.reason }

  const waiting = await livePending(card.id, user.id, database, now)
  if (waiting) {
    return { ok: false, status: 409, error: 'a reward is already waiting for this card', progress: cardProgress }
  }

  // A reward nobody confirmed in ten minutes is dead, but its row still reads pending until
  // the watcher sweeps. Closing it here stops a lapsed reward from holding the card's one
  // pending slot against the customer who is standing at the counter now.
  await database
    .update(redemptions)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(redemptions.cardId, card.id),
        eq(redemptions.customerUserId, user.id),
        eq(redemptions.status, 'pending'),
        lte(redemptions.expiresAt, now),
      ),
    )

  const expiresAt = new Date(now.getTime() + REDEMPTION_TTL_MS)
  const cashback = card.rewardKind === 'cashback'

  // The unique indexes on the redemptions table are what actually hold this line, because
  // two requests can pass the check above in the same instant. A clash on the card and
  // customer index means somebody already holds this reward. A clash on the merchant and
  // six-digit index only means those digits are taken, so a new token is minted and the
  // insert tried again.
  for (let attempt = 0; attempt < CODE6_ATTEMPTS; attempt += 1) {
    const token = newRedemptionToken()
    const tokenHash = hashToken(token)

    try {
      const [row] = await database
        .insert(redemptions)
        .values({
          cardId: card.id,
          customerUserId: user.id,
          merchantUserId: card.merchantUserId,
          status: 'pending',
          stampsConsumed: cashback ? 0 : (card.targetVisits ?? 0),
          cashbackLuna: cashback ? cardProgress.cashbackLuna : 0,
          lunaConsumed: cashback ? cardProgress.totalLuna : 0,
          tokenHash,
          code6: code6FromTokenHash(tokenHash),
          challengeNonce: parsed.nonce,
          expiresAt,
        })
        .returning()

      if (!row) return { ok: false, status: 500, error: 'could not open the reward' }

      return {
        ok: true,
        id: row.id,
        token,
        code6: row.code6,
        expiresAt: expiresAt.toISOString(),
        reward: rewardFor(card, cardProgress),
      }
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      if (uniqueViolationIndex(error) === ONE_PENDING_INDEX) {
        return {
          ok: false,
          status: 409,
          error: 'a reward is already waiting for this card',
          progress: cardProgress,
        }
      }
    }
  }

  return { ok: false, status: 500, error: 'could not open the reward' }
}

/**
 * Finds a reward from what the merchant's phone scanned or typed, and only inside that
 * merchant's own cards. The six-digit form is deliberately narrower than the token: it
 * reaches live pending rewards only, because six digits are guessable and a token is not.
 */
export async function findRedemption(
  merchantUserId: string,
  handle: string,
  options: { database?: Db; now?: Date } = {},
): Promise<Found | null> {
  const database = options.database ?? db()
  const now = options.now ?? new Date()
  const token = handle.startsWith('vango-redeem:') ? handle.slice('vango-redeem:'.length) : handle

  if (isRedemptionToken(token)) {
    const [row] = await database
      .select({ redemption: redemptions, card: cards, customer: users })
      .from(redemptions)
      .innerJoin(cards, eq(cards.id, redemptions.cardId))
      .innerJoin(users, eq(users.id, redemptions.customerUserId))
      .where(
        and(eq(redemptions.tokenHash, hashToken(token)), eq(redemptions.merchantUserId, merchantUserId)),
      )
      .limit(1)

    return row ?? null
  }

  if (!isCode6(token)) return null

  const [row] = await database
    .select({ redemption: redemptions, card: cards, customer: users })
    .from(redemptions)
    .innerJoin(cards, eq(cards.id, redemptions.cardId))
    .innerJoin(users, eq(users.id, redemptions.customerUserId))
    .where(
      and(
        eq(redemptions.merchantUserId, merchantUserId),
        eq(redemptions.code6, token),
        eq(redemptions.status, 'pending'),
        gt(redemptions.expiresAt, now),
      ),
    )
    .limit(1)

  return row ?? null
}

export function viewRedemption(found: Found, now: Date = new Date()): RedemptionView {
  return {
    status: effectiveStatus(found.redemption, now),
    cardName: found.card.name,
    rewardText: found.card.rewardText,
    rewardKind: found.card.rewardKind as 'nth_free' | 'cashback',
    customer: maskAddress(found.customer.visibleAddress),
    stampsConsumed: found.redemption.stampsConsumed,
    cashbackLuna: found.redemption.cashbackLuna,
    expiresAt: found.redemption.expiresAt.toISOString(),
  }
}

function notPending(status: RedemptionStatus): Refusal {
  const error =
    status === 'confirmed' ? 'this reward was already given' : 'this reward expired before it was confirmed'
  return { ok: false, status: 409, error }
}

/**
 * The merchant accepts the reward. For a stamp card that is the end of it. For cashback
 * it also tells the merchant's phone exactly what to pay, to whom, and with which memo.
 *
 * The update carries the whole check in its WHERE clause, so two taps on the confirm
 * button write one row between them.
 */
export async function confirmRedemption(
  merchantUserId: string,
  handle: string,
  options: { database?: Db; now?: Date } = {},
): Promise<ConfirmResult> {
  const database = options.database ?? db()
  const now = options.now ?? new Date()

  const found = await findRedemption(merchantUserId, handle, { database, now })
  if (!found) return { ok: false, status: 404, error: 'reward not found' }

  const status = effectiveStatus(found.redemption, now)
  if (status !== 'pending') return notPending(status)

  const standing = await progress(found.card.id, found.customer.id, database)
  const covered =
    found.card.rewardKind === 'cashback'
      ? standing.cashbackLuna >= found.redemption.cashbackLuna
      : standing.stamps >= found.redemption.stampsConsumed
  if (!covered) {
    return { ok: false, status: 409, error: 'not redeemable yet', progress: standing }
  }

  const [updated] = await database
    .update(redemptions)
    .set({ status: 'confirmed', confirmedAt: now })
    .where(
      and(
        eq(redemptions.id, found.redemption.id),
        eq(redemptions.status, 'pending'),
        gt(redemptions.expiresAt, now),
      ),
    )
    .returning()

  if (!updated) return { ok: false, status: 409, error: 'this reward was already given or has expired' }

  if (found.card.rewardKind !== 'cashback') return { ok: true, id: updated.id, status: 'confirmed' }

  return {
    ok: true,
    id: updated.id,
    status: 'confirmed',
    payTo: found.customer.visibleAddress,
    amountLuna: updated.cashbackLuna,
    memo: `vango-cashback:${updated.code6}`,
  }
}

/**
 * The addresses a cashback payout is allowed to come from: the merchant's own wallet,
 * the remote account Nimiq Pay spends from, and the counter the card is paid into.
 */
async function merchantPayoutAddresses(card: Card, database: Db): Promise<string[]> {
  const [merchant] = await database
    .select({ visibleAddress: users.visibleAddress, remoteAddress: users.remoteAddress })
    .from(users)
    .where(eq(users.id, card.merchantUserId))
    .limit(1)

  return [card.receivingAddress, merchant?.visibleAddress, merchant?.remoteAddress]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .map(comparableAddress)
}

/**
 * Records the cashback payment the merchant's phone has just made.
 *
 * The server never sends this money; it reads the transaction back off the chain and
 * refuses anything that does not match: a payment somebody else made, a payment to
 * somebody else, a payment smaller than what is owed, or a hash that is still floating
 * around unconfirmed. Without the sender check a merchant could close their own debt
 * with any stranger's payment that happened to land on the customer's address. The
 * hash is stored under a unique index, so one payment can never close two rewards.
 */
export async function settleCashback(
  merchantUserId: string,
  handle: string,
  hash: string,
  options: { database?: Db; now?: Date; fetch?: typeof fetchTransaction } = {},
): Promise<SettleResult> {
  const database = options.database ?? db()
  const now = options.now ?? new Date()
  const load = options.fetch ?? fetchTransaction

  const found = await findRedemption(merchantUserId, handle, { database, now })
  if (!found) return { ok: false, status: 404, error: 'reward not found' }
  if (found.card.rewardKind !== 'cashback') {
    return { ok: false, status: 409, error: 'this reward is not a cashback payment' }
  }
  if (found.redemption.status !== 'confirmed') {
    return { ok: false, status: 409, error: 'confirm the reward before paying it' }
  }
  if (found.redemption.cashbackTxHash !== null) {
    return { ok: false, status: 409, error: 'this reward was already paid' }
  }

  const tx = await load(hash)
  if (!tx) return { ok: false, status: 409, error: 'no such payment on chain' }
  if (tx.blockNumber <= 0) return { ok: false, status: 409, error: 'payment is not in a block yet' }

  const payers = await merchantPayoutAddresses(found.card, database)
  if (!payers.includes(comparableAddress(tx.sender))) {
    return { ok: false, status: 409, error: 'payment did not come from the merchant' }
  }

  if (comparableAddress(tx.recipient) !== comparableAddress(found.customer.visibleAddress)) {
    return { ok: false, status: 409, error: 'payment did not go to the customer' }
  }
  if (tx.valueLuna < found.redemption.cashbackLuna) {
    return { ok: false, status: 409, error: 'payment is smaller than the cashback owed' }
  }

  try {
    const [updated] = await database
      .update(redemptions)
      .set({ cashbackTxHash: tx.hash })
      .where(and(eq(redemptions.id, found.redemption.id), isNull(redemptions.cashbackTxHash)))
      .returning({ cashbackTxHash: redemptions.cashbackTxHash })

    if (!updated?.cashbackTxHash) return { ok: false, status: 409, error: 'this reward was already paid' }

    return { ok: true, status: 'confirmed', cashbackTxHash: updated.cashbackTxHash }
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, status: 409, error: 'that payment already settled another reward' }
    }
    throw error
  }
}

/** Closes every reward nobody confirmed in time. The watcher calls this each pass. */
export async function expireRedemptions(database: Db = db(), now: Date = new Date()): Promise<number> {
  const closed = await database
    .update(redemptions)
    .set({ status: 'cancelled' })
    .where(and(eq(redemptions.status, 'pending'), lte(redemptions.expiresAt, now)))
    .returning({ id: redemptions.id })

  return closed.length
}
