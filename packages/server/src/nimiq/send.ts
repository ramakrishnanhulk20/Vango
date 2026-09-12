import { setTimeout as sleep } from 'node:timers/promises'
import { Address, type KeyPair, type Transaction, TransactionBuilder } from '@nimiq/core'
import { config } from '../config.js'
import { normalizeAddress } from '../lib/address.js'
import { fetchTransaction, getBlockNumber, sendRawTransaction, type ChainTransaction } from './rpc.js'

/**
 * Albatross network ids. 5 is read off a live testnet transaction on
 * rpc.testnet.nimiqwatch.com, so it is measured and not copied from a doc page.
 *
 * The mainnet is deliberately absent. This is the only file in Vango that signs with
 * the merchant key from .env, and it exists to drive the prove-it run and the attack
 * scripts. Nothing here should be able to spend real NIM because somebody changed one
 * line of configuration.
 */
const NETWORK_IDS: Record<string, number> = { TestAlbatross: 5 }

/** The largest memo Nimiq carries in a basic transaction. */
export const MAX_DATA_BYTES = 64

export function networkIdFor(network: string = config.NIMIQ_NETWORK): number {
  const id = NETWORK_IDS[network]
  if (id === undefined) throw new Error(`sending is wired for TestAlbatross only, not ${network}`)
  return id
}

export type BuildInput = {
  keyPair: KeyPair
  recipient: string
  valueLuna: number
  data: string
  validityStartHeight: number
  networkId: number
}

export type SendInput = {
  keyPair: KeyPair
  recipient: string
  valueLuna: number
  data: string
}

/**
 * Builds and signs one payment with a memo, without touching the network.
 *
 * Throws before anything is signed when the recipient is not a Nimiq address, when the
 * amount is not a positive whole number of Luna, when the memo is over 64 bytes, or
 * when sender and recipient are the same address, which the protocol rejects with
 * "Sender same as recipient". Fees are zero: Nimiq's testnet accepts them and a busy
 * mempool is not a case this file has to win.
 */
export function buildSignedTransaction(input: BuildInput): Transaction {
  const recipient = normalizeAddress(input.recipient)
  if (!recipient) throw new Error(`${input.recipient} is not a Nimiq address`)

  if (!Number.isInteger(input.valueLuna) || input.valueLuna <= 0) {
    throw new Error(`value must be a whole number of Luna above zero, got ${input.valueLuna}`)
  }

  const data = new TextEncoder().encode(input.data)
  if (data.byteLength > MAX_DATA_BYTES) {
    throw new Error(`memo is ${data.byteLength} bytes, the limit is ${MAX_DATA_BYTES}`)
  }

  const sender = input.keyPair.toAddress()
  if (sender.toUserFriendlyAddress().replace(/\s+/g, '') === recipient) {
    throw new Error('a Nimiq transaction cannot pay its own sender')
  }

  const transaction = TransactionBuilder.newBasicWithData(
    sender,
    Address.fromUserFriendlyAddress(recipient),
    data,
    BigInt(input.valueLuna),
    0n,
    input.validityStartHeight,
    input.networkId,
  )

  transaction.sign(input.keyPair, undefined)

  return transaction
}

export function toRawHex(transaction: Transaction): string {
  return Buffer.from(transaction.serialize()).toString('hex')
}

/**
 * Pays one address from a key we hold, with a memo, and returns the transaction hash.
 *
 * The transaction is valid from the block the chain is on right now. Signing happens
 * here and the node only relays the finished bytes, so the key never leaves this
 * process. Throws if the node refuses the broadcast, which means no money moved.
 */
export async function sendWithData(input: SendInput): Promise<string> {
  const validityStartHeight = await getBlockNumber()

  const transaction = buildSignedTransaction({
    ...input,
    validityStartHeight,
    networkId: networkIdFor(),
  })

  const broadcast = await sendRawTransaction(toRawHex(transaction))

  return broadcast || transaction.hash()
}

/** How often a broadcast transaction is looked for while waiting for a block. */
export const POLL_MS = 2000

/**
 * Waits for a broadcast transaction to land in a block and hands back what the chain
 * says about it. Null means the timeout ran out first, which is not proof the payment
 * failed: it may still be in the mempool.
 */
export async function waitForInclusion(hash: string, timeoutMs = 60000): Promise<ChainTransaction | null> {
  const deadline = Date.now() + timeoutMs

  for (;;) {
    const tx = await fetchTransaction(hash).catch(() => null)
    if (tx && tx.blockNumber > 0) return tx
    if (Date.now() >= deadline) return null
    await sleep(POLL_MS)
  }
}
