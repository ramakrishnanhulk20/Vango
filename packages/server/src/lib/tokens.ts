import { createHash, randomBytes } from 'node:crypto'

/**
 * Session and redemption tokens carry a prefix so a token can never be mistaken for a
 * row id, and so a leaked string is recognisable in a log or a bug report. The database
 * stores only the sha256, which means a stolen table dump cannot be replayed.
 */
export const SESSION_PREFIX = 'vs1.'
export const REDEMPTION_PREFIX = 'vr1.'

const SESSION_BYTES = 32
const REDEMPTION_BYTES = 16

const SESSION_PATTERN = new RegExp(`^${SESSION_PREFIX.replace('.', '\\.')}[0-9a-f]{${SESSION_BYTES * 2}}$`)
const REDEMPTION_PATTERN = new RegExp(`^${REDEMPTION_PREFIX.replace('.', '\\.')}[0-9a-f]{${REDEMPTION_BYTES * 2}}$`)

export function newSessionToken(): string {
  return `${SESSION_PREFIX}${randomBytes(SESSION_BYTES).toString('hex')}`
}

export function newRedemptionToken(): string {
  return `${REDEMPTION_PREFIX}${randomBytes(REDEMPTION_BYTES).toString('hex')}`
}

export function isSessionToken(value: unknown): value is string {
  return typeof value === 'string' && SESSION_PATTERN.test(value)
}

export function isRedemptionToken(value: unknown): value is string {
  return typeof value === 'string' && REDEMPTION_PATTERN.test(value)
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/** Pulls the token out of an `Authorization: Bearer ...` header, or null if there is none. */
export function bearerToken(header: string | undefined): string | null {
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match?.[1] ?? null
}

/**
 * The six digits a merchant can type when the camera will not open. Derived from the
 * stored hash, so the short code exists for every redemption without keeping a second
 * secret, and knowing the six digits tells you nothing about the token. Six digits
 * collide, which is why every lookup is scoped to one merchant's live redemptions.
 */
export function code6FromTokenHash(tokenHash: string): string {
  const tail = tokenHash.slice(-12)
  return String(BigInt(`0x${tail}`) % 1000000n).padStart(6, '0')
}

export function isCode6(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6}$/.test(value)
}
