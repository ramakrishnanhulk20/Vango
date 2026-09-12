import { formatAddress, normalizeAddress } from '../lib/address.js'
import { config } from '../config.js'

/** One transaction exactly as the Albatross JSON-RPC node returns it. */
export type RpcTransaction = {
  hash: string
  blockNumber: number
  timestamp: number
  confirmations: number
  from: string
  fromType: number
  to: string
  toType: number
  value: number
  fee: number
  senderData: string
  recipientData: string
  validityStartHeight: number
  networkId: number
  executionResult?: boolean
}

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message)
    this.name = 'RpcError'
  }
}

/** True when the node's answer means "no such transaction", not "something broke". */
export function isNotFound(error: unknown): boolean {
  if (!(error instanceof RpcError)) return false
  const detail = typeof error.data === 'string' ? error.data : ''
  return /not found/i.test(detail) || /not found/i.test(error.message)
}

let nextId = 1

async function call<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(config.NIMIQ_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })

  if (!response.ok) {
    throw new RpcError(`RPC ${method} returned HTTP ${response.status}`, response.status)
  }

  const body = (await response.json()) as {
    result?: { data: T }
    error?: { code: number; message: string; data?: unknown }
  }

  if (body.error) throw new RpcError(body.error.message, body.error.code, body.error.data)
  if (!body.result) throw new RpcError(`RPC ${method} returned no result`, -1)

  return body.result.data
}

export function getBlockNumber(): Promise<number> {
  return call<number>('getBlockNumber', [])
}

export function getTransactionByHash(hash: string): Promise<RpcTransaction> {
  return call<RpcTransaction>('getTransactionByHash', [hash])
}

/** What an address holds right now, in Luna. The node also accepts the stripped form. */
export async function getBalance(address: string): Promise<number> {
  const account = await call<{ balance: number }>('getAccountByAddress', [formatAddress(address)])
  return account.balance
}

/**
 * Hands a signed transaction to the node. The transaction is built and signed here, so
 * the node only relays it: it never sees a key. Answers with the hash it will be known
 * by on chain, which is the same hash the signer computed before broadcasting.
 */
export function sendRawTransaction(rawHex: string): Promise<string> {
  return call<string>('sendRawTransaction', [rawHex])
}

/**
 * The node rejects this call with "expected struct ... with 3 elements" unless the
 * third parameter is present, so the trailing null is required, not optional. Passing a
 * transaction hash there asks the node for the page before that transaction.
 */
export function getTransactionsByAddress(
  address: string,
  max: number,
  beforeHash: string | null = null,
): Promise<RpcTransaction[]> {
  return call<RpcTransaction[]>('getTransactionsByAddress', [address, max, beforeHash])
}

/**
 * Turns a transaction's data field into the text a person typed. The node hands the
 * field back as hex, empty string when there is no memo. Returns null for anything that
 * is not printable text, since staking and contract transactions put binary in here.
 */
export function decodeMemo(hexOrBytes: string | Uint8Array | null | undefined): string | null {
  if (hexOrBytes == null) return null

  let bytes: Uint8Array
  if (typeof hexOrBytes === 'string') {
    const trimmed = hexOrBytes.trim()
    if (trimmed.length === 0) return null
    if (trimmed.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(trimmed)) return null
    bytes = Uint8Array.from(Buffer.from(trimmed, 'hex'))
  } else {
    bytes = hexOrBytes
  }

  if (bytes.byteLength === 0) return null

  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return null
  }

  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) return null
  }
  return text
}

/** One incoming payment, read off the chain and decoded into the fields Vango needs. */
export type ChainTransaction = {
  hash: string
  blockNumber: number
  sender: string
  recipient: string
  valueLuna: number
  memo: string | null
}

export function toChainTransaction(tx: RpcTransaction): ChainTransaction {
  return {
    hash: tx.hash,
    blockNumber: typeof tx.blockNumber === 'number' ? tx.blockNumber : 0,
    sender: normalizeAddress(tx.from) ?? tx.from.replace(/\s+/g, '').toUpperCase(),
    recipient: normalizeAddress(tx.to) ?? tx.to.replace(/\s+/g, '').toUpperCase(),
    valueLuna: tx.value,
    memo: decodeMemo(tx.recipientData),
  }
}

/** Null means the node has never seen this hash, which is not an error: it may be seconds old. */
export async function fetchTransaction(hash: string): Promise<ChainTransaction | null> {
  try {
    return toChainTransaction(await getTransactionByHash(hash))
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/** The node's own ceiling per call. A busy address is read as several of these. */
export const PAGE_SIZE = 500

/**
 * Stops a broken or hostile node from holding the watcher in a loop. 20 full pages is
 * 10,000 transactions into one address since the last pass, which no real merchant
 * reaches in a few seconds.
 */
export const MAX_PAGES = 20

export type PageFetcher = (
  address: string,
  max: number,
  beforeHash: string | null,
) => Promise<RpcTransaction[]>

/**
 * Payments into one address that are newer than the block we last looked at. The node
 * hands back both directions and only accepts the spaced form of an address, so both
 * are handled here rather than at every call site. Oldest first, so a caller can stamp
 * them in the order they happened.
 *
 * A full page means there is more behind it, so the next call carries the last hash and
 * asks for the page before it. Without that, a busy counter would have its older
 * payments cut off and never stamped. Reading stops as soon as a page reaches back past
 * the cursor, because everything older than that was handled on an earlier pass.
 */
export async function listIncoming(
  address: string,
  sinceBlock: number,
  options: { pageSize?: number; fetchPage?: PageFetcher } = {},
): Promise<ChainTransaction[]> {
  const wanted = normalizeAddress(address)
  if (!wanted) return []

  const pageSize = options.pageSize ?? PAGE_SIZE
  const fetchPage = options.fetchPage ?? getTransactionsByAddress
  const spaced = formatAddress(wanted)

  const seen = new Map<string, ChainTransaction>()
  let beforeHash: string | null = null

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const rows = await fetchPage(spaced, pageSize, beforeHash)
    if (rows.length === 0) break

    let reachedCursor = false
    for (const row of rows) {
      const tx = toChainTransaction(row)
      if (tx.blockNumber <= sinceBlock) reachedCursor = true
      if (tx.recipient === wanted && tx.blockNumber > sinceBlock) seen.set(tx.hash, tx)
    }

    if (rows.length < pageSize || reachedCursor) break
    beforeHash = rows[rows.length - 1]?.hash ?? null
    if (!beforeHash) break
  }

  return [...seen.values()].sort((a, b) => a.blockNumber - b.blockNumber)
}

/** 1 NIM is 100,000 Luna. Returned as a string so no cent goes missing to float maths. */
export function lunaToNim(luna: number): string {
  const negative = luna < 0
  const whole = Math.trunc(Math.abs(luna))
  const nim = Math.trunc(whole / 100000)
  const rest = String(whole % 100000).padStart(5, '0').replace(/0+$/, '')
  return `${negative ? '-' : ''}${nim}${rest ? `.${rest}` : ''}`
}
