import { randomInt } from 'node:crypto'

/**
 * Crockford base32 with the vowels taken out as well: no I, L, O or U (they look like
 * 1, 1, 0 and V), and no A or E either, so a code can never spell a word a merchant
 * would rather not print on their counter. Thirty characters, read aloud without
 * ambiguity over a noisy cafe counter.
 */
export const CODE_ALPHABET = '0123456789BCDFGHJKMNPQRSTVWXYZ'

export const CODE_LENGTH = 8

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

const MEMO_PATTERN = new RegExp(`^vango:([${CODE_ALPHABET}]{${CODE_LENGTH}})$`, 'i')

export function generateCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

export function isCardCode(value: unknown): value is string {
  return typeof value === 'string' && CODE_PATTERN.test(value.toUpperCase())
}

/**
 * Reads the card code out of a payment's memo. The memo a customer's wallet attaches is
 * exactly `vango:<CODE>`; anything else, including an empty memo, is not ours and
 * returns null. Case does not matter because some keyboards capitalise the first
 * letter on their own.
 */
export function parseMemo(text: unknown): string | null {
  if (typeof text !== 'string') return null
  const match = MEMO_PATTERN.exec(text.trim())
  return match?.[1] ? match[1].toUpperCase() : null
}
