import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, type Db } from '../db/client.js'
import { cards, stamps, users, type Card } from '../db/schema.js'
import { generateCode } from '../lib/code.js'
import { normalizeAddress } from '../lib/address.js'

export const MIN_STAMP_LUNA = 100000

const CODE_ATTEMPTS = 8

const cardFields = {
  merchantUserId: z.uuid(),
  name: z.string().trim().min(1).max(40),
  rewardText: z.string().trim().min(1).max(60),
  minLuna: z.number().int().min(MIN_STAMP_LUNA).default(MIN_STAMP_LUNA),
}

/**
 * What a merchant fills in to open a card. The two reward rules are separate shapes on
 * purpose: a card is "every Nth visit free" or "a share of every payment back", and
 * mixing the two fields would let a card exist that the stamp engine cannot read.
 */
export const createCardInput = z.discriminatedUnion('rewardKind', [
  z.object({
    ...cardFields,
    rewardKind: z.literal('nth_free'),
    targetVisits: z.number().int().min(2).max(20),
  }),
  z.object({
    ...cardFields,
    rewardKind: z.literal('cashback'),
    cashbackBps: z.number().int().min(1).max(2000),
  }),
])

export type CreateCardInput = z.input<typeof createCardInput>

/**
 * Opens a new loyalty card and gives it a short code customers can read off a sign.
 *
 * A card is always paid into the merchant's own visible address. The merchant does not
 * get to name it, because an address they do not control would send every customer's
 * payment to a stranger, and an address belonging to another of their accounts would let
 * them farm their own stamps. It is read from the users table here, never from the input.
 *
 * The code is random, so two merchants can collide; the insert is guarded by the
 * unique index and simply tries again, which is cheaper than locking a code table.
 * Throws a ZodError when the rule is not one the engine can read, and a plain Error
 * when the merchant is unknown or eight random codes in a row are all taken.
 */
export async function createCard(input: CreateCardInput, database: Db = db()): Promise<Card> {
  const parsed = createCardInput.parse(input)

  const [merchant] = await database
    .select({ visibleAddress: users.visibleAddress })
    .from(users)
    .where(eq(users.id, parsed.merchantUserId))
    .limit(1)

  if (!merchant) throw new Error(`unknown merchant ${parsed.merchantUserId}`)

  const receivingAddress = normalizeAddress(merchant.visibleAddress)
  if (!receivingAddress) throw new Error('the merchant wallet is not a valid Nimiq address')

  const rule =
    parsed.rewardKind === 'nth_free'
      ? { rewardKind: 'nth_free' as const, targetVisits: parsed.targetVisits, cashbackBps: null }
      : { rewardKind: 'cashback' as const, cashbackBps: parsed.cashbackBps, targetVisits: null }

  for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt += 1) {
    const [row] = await database
      .insert(cards)
      .values({
        code: generateCode(),
        merchantUserId: parsed.merchantUserId,
        name: parsed.name,
        rewardText: parsed.rewardText,
        receivingAddress,
        minLuna: parsed.minLuna,
        ...rule,
      })
      .onConflictDoNothing({ target: cards.code })
      .returning()

    if (row) return row
  }

  throw new Error(`could not find a free card code in ${CODE_ATTEMPTS} tries`)
}

export async function cardByCode(code: string, database: Db = db()): Promise<Card | null> {
  const [row] = await database.select().from(cards).where(eq(cards.code, code.toUpperCase())).limit(1)
  return row ?? null
}

export async function cardById(id: string, database: Db = db()): Promise<Card | null> {
  const [row] = await database.select().from(cards).where(eq(cards.id, id)).limit(1)
  return row ?? null
}

/** One of a merchant's cards with the two counts their dashboard leads with. */
export type CardSummary = {
  code: string
  name: string
  rewardKind: 'nth_free' | 'cashback'
  rewardText: string
  targetVisits: number | null
  cashbackBps: number | null
  minLuna: number
  receivingAddress: string
  active: boolean
  stampCount: number
  customerCount: number
  createdAt: string
}

const summaryColumns = {
  card: cards,
  stampCount: sql<number>`count(${stamps.id})::int`,
  customerCount: sql<number>`count(distinct ${stamps.senderAddress})::int`,
}

function toSummary(row: { card: Card; stampCount: number; customerCount: number }): CardSummary {
  return {
    code: row.card.code,
    name: row.card.name,
    rewardKind: row.card.rewardKind as 'nth_free' | 'cashback',
    rewardText: row.card.rewardText,
    targetVisits: row.card.targetVisits,
    cashbackBps: row.card.cashbackBps,
    minLuna: row.card.minLuna,
    receivingAddress: row.card.receivingAddress,
    active: row.card.active,
    stampCount: Number(row.stampCount ?? 0),
    // One paying wallet is one customer, counted by the address that sent the money,
    // because a customer who has never opened the app still walked through the door.
    customerCount: Number(row.customerCount ?? 0),
    createdAt: row.card.createdAt.toISOString(),
  }
}

/** Every card a merchant has opened, newest first. */
export async function cardSummaries(merchantUserId: string, database: Db = db()): Promise<CardSummary[]> {
  const rows = await database
    .select(summaryColumns)
    .from(cards)
    .leftJoin(stamps, eq(stamps.cardId, cards.id))
    .where(eq(cards.merchantUserId, merchantUserId))
    .groupBy(cards.id)
    .orderBy(desc(cards.createdAt))

  return rows.map(toSummary)
}

export async function cardSummaryById(cardId: string, database: Db = db()): Promise<CardSummary | null> {
  const [row] = await database
    .select(summaryColumns)
    .from(cards)
    .leftJoin(stamps, eq(stamps.cardId, cards.id))
    .where(eq(cards.id, cardId))
    .groupBy(cards.id)

  return row ? toSummary(row) : null
}

/** The addresses the watcher has to follow: one entry per address, however many cards share it. */
export async function activeReceivingAddresses(database: Db = db()): Promise<string[]> {
  const rows = await database
    .selectDistinct({ receivingAddress: cards.receivingAddress })
    .from(cards)
    .where(eq(cards.active, true))

  return rows.map((row) => row.receivingAddress)
}
