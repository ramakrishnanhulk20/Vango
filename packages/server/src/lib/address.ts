import { Address } from '@nimiq/core'

/**
 * Turns anything a wallet, a QR code or the chain hands us into the one form the
 * database stores: uppercase, no spaces, checksum proven. Returns null when the string
 * is not a real Nimiq address, so a typed-in address can never become a card that
 * receives nothing.
 */
export function normalizeAddress(address: unknown): string | null {
  if (typeof address !== 'string') return null

  const stripped = address.replace(/\s+/g, '').toUpperCase()
  if (!/^NQ[0-9A-Z]{34}$/.test(stripped)) return null

  try {
    return Address.fromUserFriendlyAddress(stripped).toUserFriendlyAddress().replace(/\s+/g, '')
  } catch {
    return null
  }
}

/**
 * The form two addresses are compared in. Normalised when the string is a real address,
 * stripped and uppercased when it is not, so a comparison never silently succeeds on
 * two different pieces of junk and never fails over a space or a lowercase letter.
 */
export function comparableAddress(value: string): string {
  return normalizeAddress(value) ?? value.replace(/\s+/g, '').toUpperCase()
}

/** The way a Nimiq address is written for people: groups of four, separated by spaces. */
export function formatAddress(address: string): string {
  const stripped = address.replace(/\s+/g, '').toUpperCase()
  return stripped.replace(/.{1,4}/g, (group) => `${group} `).trim()
}
