import { Hash, type KeyPair, PublicKey, Signature } from '@nimiq/core'
import { normalizeAddress } from '../lib/address.js'

/**
 * The exact byte prefix a Nimiq wallet puts in front of a message before it signs it.
 * 0x16 is the length of the text that follows it. This string is not written down
 * anywhere on nimiq.dev; it comes from HubApi.MSG_PREFIX in @nimiq/hub-api and is used
 * unchanged by the two working verifiers in reference/winners.
 */
const SIGNED_MESSAGE_PREFIX = '\x16Nimiq Signed Message:\n'

const encoder = new TextEncoder()

export type VerifyInput = {
  address: string
  publicKey: string
  signature: string
  message: string
}

export type VerifyResult = { ok: true; address: string } | { ok: false; reason: string }

export type SignedMessage = {
  address: string
  publicKey: string
  signature: string
  message: string
}

/**
 * Builds the bytes a Nimiq wallet actually signs: the prefix, then the byte length of
 * the message, then the message itself. The length counts UTF-8 bytes, not characters,
 * so a message with an emoji in it still verifies.
 */
export function encodeNimiqSignedMessage(message: string): Uint8Array {
  const messageBytes = encoder.encode(message)
  const prefixBytes = encoder.encode(`${SIGNED_MESSAGE_PREFIX}${messageBytes.byteLength}`)
  const payload = new Uint8Array(prefixBytes.byteLength + messageBytes.byteLength)
  payload.set(prefixBytes)
  payload.set(messageBytes, prefixBytes.byteLength)
  return payload
}

/**
 * Nimiq Pay returns the public key and the signature as hex. Proven on Ram's iPhone on
 * 11 September 2026 (reference/notes/SPIKE-RESULTS.md), so hex is the only form
 * accepted here: anything else is a caller sending us something we did not ask for.
 */
function decodeKeyMaterial(value: string, byteLength: number): Uint8Array | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!new RegExp(`^[0-9a-fA-F]{${byteLength * 2}}$`).test(trimmed)) return null
  return Uint8Array.from(Buffer.from(trimmed, 'hex'))
}

/**
 * Checks that `signature` really is the wallet that owns `address` signing `message`.
 *
 * Three things have to hold, and each failure gets its own reason so the spike page can
 * show which one broke: the public key has to derive to the claimed address, the
 * signature has to be over the prefixed form of the message, and the address has to
 * look like a Nimiq address at all.
 */
export function verifySignedMessage(input: VerifyInput): VerifyResult {
  const { address, publicKey, signature, message } = input ?? ({} as VerifyInput)

  if (typeof message !== 'string' || message.length === 0) return { ok: false, reason: 'missing message' }

  const claimed = normalizeAddress(address)
  if (!claimed) return { ok: false, reason: 'bad address format' }

  const publicKeyBytes = decodeKeyMaterial(publicKey, 32)
  if (!publicKeyBytes) return { ok: false, reason: 'malformed public key' }

  const signatureBytes = decodeKeyMaterial(signature, 64)
  if (!signatureBytes) return { ok: false, reason: 'malformed signature' }

  try {
    const key = new PublicKey(publicKeyBytes)
    const derived = normalizeAddress(key.toAddress().toUserFriendlyAddress())
    if (derived !== claimed) return { ok: false, reason: 'public key does not match address' }

    const hash = Hash.computeSha256(encodeNimiqSignedMessage(message))
    if (!key.verify(Signature.deserialize(signatureBytes), hash)) {
      return { ok: false, reason: 'signature does not match message' }
    }

    return { ok: true, address: key.toAddress().toUserFriendlyAddress() }
  } catch {
    return { ok: false, reason: 'could not be verified' }
  }
}

/**
 * Produces the same thing a Nimiq wallet's sign() produces, so tests can build real
 * vectors without a phone in the loop. Not used by the server at runtime.
 */
export function signWithKeyPair(keyPair: KeyPair, message: string): SignedMessage {
  const hash = Hash.computeSha256(encodeNimiqSignedMessage(message))
  return {
    address: keyPair.toAddress().toUserFriendlyAddress(),
    publicKey: keyPair.publicKey.toHex(),
    signature: keyPair.sign(hash).toHex(),
    message,
  }
}
