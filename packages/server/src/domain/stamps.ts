import { and, count, eq, inArray, isNull, or, sum } from 'drizzle-orm'
import { db, type Db } from '../db/client.js'
import { cards, redemptions, stamps, users, type Card } from '../db/schema.js'
import { normalizeAddress } from '../lib/address.js'
import { parseMemo } from '../lib/code.js'
import { fetchTransaction, type ChainTransaction } from '../nimiq/rpc.js'

export type { ChainTransaction }

export type StampRefusal =
  | 'no memo'
  | 'memo not vango'
  | 'unknown card'
  | 'card inactive'
  | 'wrong recipient'
  | 'below minimum'
  | 'sender is merchant'
  | 'already stamped'
  | 'not included'

export type StampResult =
  | { stamped: true; stampId: string; cardCode: string; blockNumber: number }
  | { stamped: false; reason: StampRefusal }

export type CardProgress = {
  rewardKind: 'nth_free' | 'cashback'
  stamps: number
  target: number | null
  redeemable: boolean
  totalLuna: number
  cashbackLuna: number
}

/**
 * The chain writes addresses in the same alphabet we do, so this only fails on junk.
 * Keeping the raw form means a stamp is never silently dropped over an encoding.
 */
function chainAddress(value: string): string {
  return normalizeAddress(value) ?? value.replace(/\s+/g, '').toUpperCase()
}

/**
 * Turns one confirmed chain payment into a stamp, or says exactly why it is not one.
 *
 * Every refusal is a rule a merchant would recognise: no memo, a memo for someone
 * else's card, a payment that went somewhere else, a payment too small to count, the
 * merchant paying themselves, or a transaction that was already counted. A payment
 * that is not yet in a block is refused as well; a broadcast hash is not money.
 *
 * The write is idempotent. The unique index on the transaction hash is what makes a
 * replayed transaction, a watcher restart and the phone's own fast claim all land on
 * the same single stamp.
 */
export async function recordPayment(tx: ChainTransaction, database: Db = db()): Promise<StampResult> {
  if (!tx.hash || typeof tx.blockNumber !== 'number' || tx.blockNumber <= 0) {
    return { stamped: false, reason: 'not included' }
  }

  if (tx.memo === null || tx.memo.trim() === '') return { stamped: false, reason: 'no memo' }

  const code = parseMemo(tx.memo)
  if (!code) return { stamped: false, reason: 'memo not vango' }

  const [card] = await database.select().from(cards).where(eq(cards.code, code)).limit(1)
  if (!card) return { stamped: false, reason: 'unknown card' }
  if (!card.active) return { stamped: false, reason: 'card inactive' }

  const recipient = chainAddress(tx.recipient)
  if (recipient !== card.receivingAddress) return { stamped: false, reason: 'wrong recipient' }

  if (tx.valueLuna < card.minLuna) return { stamped: false, reason: 'below minimum' }

  const sender = chainAddress(tx.sender)
  if (await isMerchantAddress(card, sender, database)) return { stamped: false, reason: 'sender is merchant' }

  const customerUserId = await userIdForAddress(sender, database)

  const [row] = await database
    .insert(stamps)
    .values({
      cardId: card.id,
      customerUserId,
      senderAddress: sender,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      valueLuna: tx.valueLuna,
    })
    .onConflictDoNothing({ target: stamps.txHash })
    .returning({ id: stamps.id })

  if (!row) return { stamped: false, reason: 'already stamped' }

  return { stamped: true, stampId: row.id, cardCode: card.code, blockNumber: tx.blockNumber }
}

/**
 * Fetches one transaction by hash and stamps it. This is the two-second path: the
 * phone reports the hash it just got back from the wallet, and the customer sees the
 * stamp without waiting for the watcher's next pass.
 */
export async function claimByHash(
  hash: string,
  options: { database?: Db; fetch?: typeof fetchTransaction } = {},
): Promise<StampResult> {
  const load = options.fetch ?? fetchTransaction
  const tx = await load(hash)
  if (!tx) return { stamped: false, reason: 'not included' }
  return recordPayment(tx, options.database ?? db())
}

/**
 * Claims the stamps that arrived before we knew who the payer was.
 *
 * Nimiq Pay pays out of the user's remote account, so a payment can land from an
 * address no Vango user has ever shown us. Those stamps are stored with no owner and
 * are handed over the first time that wallet opens the app. Returns how many moved.
 */
export async function attachStampsToUser(userId: string, database: Db = db()): Promise<number> {
  const [user] = await database.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return 0

  const owned = [user.visibleAddress, user.remoteAddress].filter((value): value is string => value !== null)
  if (owned.length === 0) return 0

  const moved = await database
    .update(stamps)
    .set({ customerUserId: userId })
    .where(and(isNull(stamps.customerUserId), inArray(stamps.senderAddress, owned)))
    .returning({ id: stamps.id })

  return moved.length
}

/**
 * Where a customer stands on one card: how many stamps count right now, what the card
 * asks for, and whether the reward can be taken. Stamps already spent by a confirmed
 * redemption are subtracted, so a full card does not stay full after it is used.
 */
export async function progress(cardId: string, userId: string, database: Db = db()): Promise<CardProgress> {
  const [card] = await database.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!card) throw new Error(`unknown card ${cardId}`)

  const [totals] = await database
    .select({ stamps: count(), luna: sum(stamps.valueLuna) })
    .from(stamps)
    .where(and(eq(stamps.cardId, cardId), eq(stamps.customerUserId, userId)))

  const [spent] = await database
    .select({ consumed: sum(redemptions.stampsConsumed), cashbackPaid: sum(redemptions.cashbackLuna) })
    .from(redemptions)
    .where(
      and(
        eq(redemptions.cardId, cardId),
        eq(redemptions.customerUserId, userId),
        eq(redemptions.status, 'confirmed'),
      ),
    )

  const earned = totals?.stamps ?? 0
  const consumed = Number(spent?.consumed ?? 0)
  const available = Math.max(0, earned - consumed)
  const totalLuna = Number(totals?.luna ?? 0)

  if (card.rewardKind === 'cashback') {
    // Cashback is a running balance, not a full card: what the spend has earned, less
    // what the merchant has already agreed to pay back.
    const earnedLuna = Math.floor((totalLuna * (card.cashbackBps ?? 0)) / 10000)
    const paidBack = Number(spent?.cashbackPaid ?? 0)
    const owed = Math.max(0, earnedLuna - paidBack)
    return {
      rewardKind: 'cashback',
      stamps: available,
      target: null,
      redeemable: owed > 0,
      totalLuna,
      cashbackLuna: owed,
    }
  }

  const target = card.targetVisits
  return {
    rewardKind: 'nth_free',
    stamps: available,
    target,
    redeemable: target !== null && available >= target,
    totalLuna,
    cashbackLuna: 0,
  }
}

/**
 * True when the payer is the merchant wearing any of their hats: the counter this card is
 * paid into, the wallet they signed in with, the remote account Nimiq Pay spends from, or
 * the counter of any other card they own, open or closed. The last one matters because a
 * merchant with two cards could otherwise pay one counter from the other and farm stamps,
 * and a closed card's address is still theirs.
 */
async function isMerchantAddress(card: Card, sender: string, database: Db): Promise<boolean> {
  if (sender === card.receivingAddress) return true

  const [merchant] = await database
    .select({ id: users.id })
    .from(users)
    .leftJoin(cards, eq(cards.merchantUserId, users.id))
    .where(
      and(
        eq(users.id, card.merchantUserId),
        or(
          eq(users.visibleAddress, sender),
          eq(users.remoteAddress, sender),
          eq(cards.receivingAddress, sender),
        ),
      ),
    )
    .limit(1)

  return merchant !== undefined
}

/** A payer we already know, matched on the remote account first because that is what pays. */
async function userIdForAddress(sender: string, database: Db): Promise<string | null> {
  const [byRemote] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.remoteAddress, sender))
    .limit(1)
  if (byRemote) return byRemote.id

  const [byVisible] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.visibleAddress, sender))
    .limit(1)

  return byVisible?.id ?? null
}
