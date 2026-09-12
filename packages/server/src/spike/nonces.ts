import { randomBytes } from 'node:crypto'

export const NONCE_TTL_MS = 10 * 60 * 1000

export type Challenge = {
  nonce: string
  message: string
  expiresAt: number
}

export type ClaimResult = { ok: true; nonce: string } | { ok: false; reason: 'nonce unknown' | 'nonce used' | 'nonce expired' }

type Entry = {
  expiresAt: number
  usedAt: number | null
}

/**
 * Holds the one-shot login challenges. In memory on purpose: the spike proves a phone
 * can sign, and a restart losing pending challenges is the correct behaviour for that.
 * A used nonce is kept until it expires so a replay gets "nonce used" and not the
 * vaguer "nonce unknown", which is what tells us a replay attempt from a typo.
 */
export class NonceStore {
  private readonly entries = new Map<string, Entry>()

  constructor(private readonly now: () => number = Date.now) {}

  issue(): Challenge {
    this.sweep()
    const nonce = randomBytes(16).toString('hex')
    const expiresAt = this.now() + NONCE_TTL_MS
    this.entries.set(nonce, { expiresAt, usedAt: null })
    return { nonce, message: buildMessage(nonce, expiresAt), expiresAt }
  }

  /** Spends a nonce. Every later call for the same nonce fails with "nonce used". */
  claim(nonce: string): ClaimResult {
    this.sweep()
    const entry = this.entries.get(nonce)
    if (!entry) return { ok: false, reason: 'nonce unknown' }
    if (entry.usedAt !== null) return { ok: false, reason: 'nonce used' }
    if (entry.expiresAt <= this.now()) return { ok: false, reason: 'nonce expired' }
    entry.usedAt = this.now()
    return { ok: true, nonce }
  }

  get size(): number {
    return this.entries.size
  }

  private sweep(): void {
    const cutoff = this.now()
    for (const [nonce, entry] of this.entries) {
      if (entry.expiresAt <= cutoff) this.entries.delete(nonce)
    }
  }
}

export function buildMessage(nonce: string, expiresAt: number): string {
  return `vango-spike:${nonce}:${expiresAt}`
}

/** Pulls the nonce back out of a message the phone signed, so it can be spent. */
export function parseMessage(message: string): { nonce: string; expiresAt: number } | null {
  const match = /^vango-spike:([0-9a-f]{32}):(\d+)$/.exec(message ?? '')
  if (!match) return null
  return { nonce: match[1]!, expiresAt: Number(match[2]) }
}
