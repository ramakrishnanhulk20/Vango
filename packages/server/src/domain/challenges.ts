import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt } from 'drizzle-orm'
import { db, type Db } from '../db/client.js'
import { challenges } from '../db/schema.js'
import { CODE_ALPHABET, CODE_LENGTH } from '../lib/code.js'

/** Ten minutes is long enough for a slow wallet dialog and short enough to be useless later. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000

export type ChallengeKind = 'login' | 'redeem'

export type IssuedChallenge = {
  nonce: string
  message: string
  expiresAt: number
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; reason: 'nonce unknown' | 'nonce used' | 'nonce expired' }

const NONCE_PATTERN = '[0-9a-f]{32}'

const LOGIN_MESSAGE = new RegExp(`^vango-login:(${NONCE_PATTERN}):(\\d{1,15})$`)

const REDEEM_MESSAGE = new RegExp(
  `^vango-redeem:([${CODE_ALPHABET}]{${CODE_LENGTH}}):(${NONCE_PATTERN}):(\\d{1,15})$`,
)

export function buildLoginMessage(nonce: string, expiresAt: number): string {
  return `vango-login:${nonce}:${expiresAt}`
}

export function buildRedeemMessage(cardCode: string, nonce: string, expiresAt: number): string {
  return `vango-redeem:${cardCode}:${nonce}:${expiresAt}`
}

export function parseLoginMessage(message: unknown): { nonce: string; expiresAt: number } | null {
  if (typeof message !== 'string') return null
  const match = LOGIN_MESSAGE.exec(message)
  if (!match?.[1] || !match[2]) return null
  return { nonce: match[1], expiresAt: Number(match[2]) }
}

export function parseRedeemMessage(
  message: unknown,
): { cardCode: string; nonce: string; expiresAt: number } | null {
  if (typeof message !== 'string') return null
  const match = REDEEM_MESSAGE.exec(message)
  if (!match?.[1] || !match[2] || !match[3]) return null
  return { cardCode: match[1], nonce: match[2], expiresAt: Number(match[3]) }
}

/**
 * Hands out a one-shot challenge and writes it down before the phone ever sees it.
 *
 * The nonce lives in the database rather than in memory so a restart, a second server
 * process or a load balancer can all spend the same challenge exactly once. Expired
 * rows are cleared on the way past; used rows are kept until they expire so a replay
 * gets told "nonce used" instead of the vaguer "nonce unknown".
 */
export async function issueChallenge(
  kind: ChallengeKind,
  subject: string | null,
  database: Db = db(),
  now: Date = new Date(),
): Promise<IssuedChallenge> {
  await database.delete(challenges).where(lt(challenges.expiresAt, now))

  const nonce = randomBytes(16).toString('hex')
  const expiry = new Date(now.getTime() + CHALLENGE_TTL_MS)

  await database.insert(challenges).values({ nonce, kind, subject, expiresAt: expiry })

  const expiresAt = expiry.getTime()
  const message = kind === 'login' ? buildLoginMessage(nonce, expiresAt) : buildRedeemMessage(subject ?? '', nonce, expiresAt)

  return { nonce, message, expiresAt }
}

/**
 * Spends a challenge. The update is the lock: only one caller can move used_at from
 * null, so two requests carrying the same signature can never both succeed. A nonce
 * issued for a different purpose or a different card reads as unknown, because telling
 * a caller which of the two it got wrong helps only an attacker.
 */
export async function consumeChallenge(
  nonce: string,
  kind: ChallengeKind,
  subject: string | null,
  database: Db = db(),
  now: Date = new Date(),
): Promise<ConsumeResult> {
  const matchesSubject = subject === null ? isNull(challenges.subject) : eq(challenges.subject, subject)

  const [claimed] = await database
    .update(challenges)
    .set({ usedAt: now })
    .where(
      and(
        eq(challenges.nonce, nonce),
        eq(challenges.kind, kind),
        matchesSubject,
        isNull(challenges.usedAt),
        gt(challenges.expiresAt, now),
      ),
    )
    .returning({ nonce: challenges.nonce })

  if (claimed) return { ok: true }

  const [row] = await database.select().from(challenges).where(eq(challenges.nonce, nonce)).limit(1)
  if (!row) return { ok: false, reason: 'nonce unknown' }
  if (row.usedAt !== null) return { ok: false, reason: 'nonce used' }
  if (row.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'nonce expired' }
  return { ok: false, reason: 'nonce unknown' }
}
