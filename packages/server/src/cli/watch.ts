import { merchantAddress } from '../app.js'
import { config } from '../config.js'
import { decodeMemo, getTransactionsByAddress, lunaToNim } from '../nimiq/rpc.js'

const POLL_MS = 3000
const MAX_PER_POLL = 25

const address = merchantAddress()
const seen = new Set<string>()

console.log(`watching ${address}`)
console.log(`on ${config.NIMIQ_NETWORK} via ${config.NIMIQ_RPC_URL}, every ${POLL_MS / 1000}s`)
console.log('')

/**
 * Nimiq Pay funds a payment out of the user's remote HTLC account, so the sender here
 * is often a contract address and not the address the user sees in their wallet. Print
 * whatever the chain says rather than trying to guess the human behind it.
 */
async function poll(): Promise<void> {
  const transactions = await getTransactionsByAddress(address, MAX_PER_POLL)

  for (const tx of [...transactions].reverse()) {
    if (seen.has(tx.hash)) continue
    seen.add(tx.hash)
    if (tx.to !== address) continue

    const memo = decodeMemo(tx.recipientData)
    console.log([
      `hash=${tx.hash}`,
      `block=${tx.blockNumber}`,
      `sender=${tx.from.replace(/\s+/g, '')}`,
      `value=${lunaToNim(tx.value)} NIM`,
      `memo=${memo ?? '(none)'}`,
    ].join('  '))
  }
}

let firstPassDone = false

async function loop(): Promise<void> {
  for (;;) {
    try {
      await poll()
      if (!firstPassDone) {
        firstPassDone = true
        console.log(`(${seen.size} transaction(s) in history above, now watching for new ones)`)
      }
    } catch (error) {
      console.error(`poll failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS))
  }
}

void loop()
