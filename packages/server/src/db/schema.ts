import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * Luna is Nimiq's smallest unit: 1 NIM is 100,000 Luna. The columns are bigint in
 * Postgres and plain numbers in JavaScript, which is safe here because the whole NIM
 * supply is 21 billion NIM, about 2.1e15 Luna, well under the 9e15 limit where a
 * JavaScript number starts losing whole digits.
 */
const luna = (name: string) => bigint(name, { mode: 'number' })

/** Addresses are always stored uppercase with no spaces, see src/lib/address.ts. */
const address = (name: string) => text(name)

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  visibleAddress: address('visible_address').notNull().unique(),
  remoteAddress: address('remote_address').unique(),
  language: text('language'),
  fiat: text('fiat'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    merchantUserId: uuid('merchant_user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    rewardKind: text('reward_kind').notNull(),
    targetVisits: integer('target_visits'),
    cashbackBps: integer('cashback_bps'),
    minLuna: luna('min_luna').notNull().default(100000),
    receivingAddress: address('receiving_address').notNull(),
    rewardText: text('reward_text').notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('cards_receiving_address_idx').on(table.receivingAddress),
    index('cards_merchant_user_id_idx').on(table.merchantUserId),
    check('cards_code_len', sql`char_length(${table.code}) = 8`),
    check('cards_name_len', sql`char_length(${table.name}) between 1 and 40`),
    check('cards_reward_text_len', sql`char_length(${table.rewardText}) between 1 and 60`),
    check('cards_reward_kind', sql`${table.rewardKind} in ('nth_free', 'cashback')`),
    check('cards_min_luna', sql`${table.minLuna} >= 100000`),
    // A card is one rule or the other, never both and never neither. Without this the
    // stamp engine would have to guess which field to read.
    check(
      'cards_rule_matches_kind',
      sql`(${table.rewardKind} = 'nth_free' and ${table.targetVisits} between 2 and 20 and ${table.cashbackBps} is null)
          or (${table.rewardKind} = 'cashback' and ${table.cashbackBps} between 1 and 2000 and ${table.targetVisits} is null)`,
    ),
  ],
)

export const stamps = pgTable(
  'stamps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    customerUserId: uuid('customer_user_id').references(() => users.id),
    senderAddress: address('sender_address').notNull(),
    txHash: text('tx_hash').notNull().unique(),
    blockNumber: integer('block_number').notNull(),
    valueLuna: luna('value_luna').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('stamps_card_customer_idx').on(table.cardId, table.customerUserId),
    index('stamps_sender_address_idx').on(table.senderAddress),
  ],
)

export const redemptions = pgTable(
  'redemptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cardId: uuid('card_id')
      .notNull()
      .references(() => cards.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    // Copied off the card so the merchant's own lookups and the one-code-at-a-time index
    // below never have to join through cards to find out whose reward this is.
    merchantUserId: uuid('merchant_user_id')
      .notNull()
      .references(() => users.id),
    stampsConsumed: integer('stamps_consumed').notNull().default(0),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    tokenHash: text('token_hash').notNull().unique(),
    /** The six digits a merchant can type instead of scanning. Derived from tokenHash. */
    code6: text('code6').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lunaConsumed: luna('luna_consumed').notNull().default(0),
    cashbackLuna: luna('cashback_luna').notNull().default(0),
    // Unique so one payment can never settle two cashback rewards.
    cashbackTxHash: text('cashback_tx_hash').unique(),
    challengeNonce: text('challenge_nonce').notNull().unique(),
  },
  (table) => [
    index('redemptions_card_customer_idx').on(table.cardId, table.customerUserId),
    // One reward at a time per card and customer. The database holds this line, not the
    // application, so two requests arriving in the same instant cannot both open one.
    uniqueIndex('redemptions_one_pending_per_card_customer')
      .on(table.cardId, table.customerUserId)
      .where(sql`status = 'pending'`),
    // Six digits are what the merchant types, so no two of their live rewards may share
    // them. Confirmed and cancelled rows are left out: those are never looked up by code.
    uniqueIndex('redemptions_one_pending_code6_per_merchant')
      .on(table.merchantUserId, table.code6)
      .where(sql`status = 'pending'`),
    check('redemptions_status', sql`${table.status} in ('pending', 'confirmed', 'cancelled')`),
    check('redemptions_stamps_consumed', sql`${table.stampsConsumed} >= 0`),
    check('redemptions_luna_consumed', sql`${table.lunaConsumed} >= 0`),
    check('redemptions_cashback_luna', sql`${table.cashbackLuna} >= 0`),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    // The token itself never reaches the database, only its sha256. A stolen dump
    // cannot be replayed as a login.
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const challenges = pgTable(
  'challenges',
  {
    nonce: text('nonce').primaryKey(),
    kind: text('kind').notNull(),
    /** What the nonce is tied to: the card code for a redeem challenge, null for a login. */
    subject: text('subject'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [check('challenges_kind', sql`${table.kind} in ('login', 'redeem')`)],
)

export const watcherCursors = pgTable('watcher_cursors', {
  receivingAddress: address('receiving_address').primaryKey(),
  lastBlock: integer('last_block').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type Card = typeof cards.$inferSelect
export type Stamp = typeof stamps.$inferSelect
export type Redemption = typeof redemptions.$inferSelect
export type WatcherCursor = typeof watcherCursors.$inferSelect
export type Session = typeof sessions.$inferSelect
export type Challenge = typeof challenges.$inferSelect
