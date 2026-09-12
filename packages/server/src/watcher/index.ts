import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { eq } from 'drizzle-orm'
import { config } from '../config.js'
import { createDb, db, type Db } from '../db/client.js'
import { applyMigrations } from '../db/migrate.js'
import { watcherCursors } from '../db/schema.js'
import { activeReceivingAddresses } from '../domain/cards.js'
import { expireRedemptions } from '../domain/redemptions.js'
import { recordPayment } from '../domain/stamps.js'
import { getBlockNumber, listIncoming, type ChainTransaction } from '../nimiq/rpc.js'

/** How far back we read the first time we ever see a merchant address. */
export const LOOKBACK_BLOCKS = 100

/** The public RPC is shared with everyone, so addresses are polled one after another. */
export const STAGGER_MS = 150

export type WatcherRpc = {
  listIncoming: (address: string, sinceBlock: number) => Promise<ChainTransaction[]>
  getBlockNumber: () => Promise<number>
}

export type WatcherOptions = {
  database?: Db
  rpc?: WatcherRpc
  log?: (line: string) => void
  staggerMs?: number
  lookbackBlocks?: number
}

export type TickSummary = {
  addresses: number
  stamped: number
  refused: number
  failed: number
  expired: number
}

const liveRpc: WatcherRpc = { listIncoming, getBlockNumber }

/**
 * One pass over every address an active card is paid into: read what is new, hand each
 * payment to the stamp engine, move the cursor forward.
 *
 * One address failing does not stop the others, and the cursor only moves over blocks
 * whose payments were handled, so a node that drops a request costs us a few seconds
 * and never a stamp. Exported so tests can drive it with a fake node.
 */
export async function tick(options: WatcherOptions = {}): Promise<TickSummary> {
  const database = options.database ?? db()
  const rpc = options.rpc ?? liveRpc
  const log = options.log ?? ((line: string) => console.log(line))
  const staggerMs = options.staggerMs ?? STAGGER_MS
  const lookbackBlocks = options.lookbackBlocks ?? LOOKBACK_BLOCKS

  const addresses = await activeReceivingAddresses(database)
  const summary: TickSummary = {
    addresses: addresses.length,
    stamped: 0,
    refused: 0,
    failed: 0,
    // A merchant who never confirms leaves a reward hanging. The watcher is the only
    // thing guaranteed to run, so closing those is its job.
    expired: await expireRedemptions(database),
  }

  if (summary.expired > 0) log(`expired ${summary.expired} unconfirmed reward(s)`)

  for (const [index, address] of addresses.entries()) {
    if (index > 0 && staggerMs > 0) await sleep(staggerMs)

    try {
      const since = await cursorFor(address, database, rpc, lookbackBlocks)
      const transactions = await rpc.listIncoming(address, since)

      let furthest = since
      for (const tx of transactions) {
        const result = await recordPayment(tx, database)
        if (result.stamped) {
          summary.stamped += 1
          log(`stamped card=${result.cardCode} hash=${tx.hash} block=${tx.blockNumber}`)
        } else {
          summary.refused += 1
          log(`skipped ${result.reason} hash=${tx.hash} block=${tx.blockNumber}`)
        }
        furthest = Math.max(furthest, tx.blockNumber)
      }

      if (furthest > since) {
        await database
          .update(watcherCursors)
          .set({ lastBlock: furthest, updatedAt: new Date() })
          .where(eq(watcherCursors.receivingAddress, address))
      }
    } catch (error) {
      summary.failed += 1
      log(`poll failed for ${address}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return summary
}

async function cursorFor(
  address: string,
  database: Db,
  rpc: WatcherRpc,
  lookbackBlocks: number,
): Promise<number> {
  const [existing] = await database
    .select()
    .from(watcherCursors)
    .where(eq(watcherCursors.receivingAddress, address))
    .limit(1)

  if (existing) return existing.lastBlock

  const head = await rpc.getBlockNumber()
  const start = Math.max(0, head - lookbackBlocks)

  const [created] = await database
    .insert(watcherCursors)
    .values({ receivingAddress: address, lastBlock: start })
    .onConflictDoNothing({ target: watcherCursors.receivingAddress })
    .returning({ lastBlock: watcherCursors.lastBlock })

  return created?.lastBlock ?? start
}

async function main(): Promise<void> {
  const handle = createDb()
  const migrations = await applyMigrations(handle)
  for (const name of migrations.applied) console.log(`applied migration ${name}`)

  console.log(`watcher on ${config.NIMIQ_NETWORK} via ${config.NIMIQ_RPC_URL}, every ${config.WATCHER_INTERVAL_MS}ms`)

  const stopping = new AbortController()
  process.on('SIGINT', () => stopping.abort())
  process.on('SIGTERM', () => stopping.abort())

  let known = -1
  while (!stopping.signal.aborted) {
    const summary = await tick({ database: handle.db })
    if (summary.addresses !== known) {
      known = summary.addresses
      console.log(`watching ${summary.addresses} address(es)`)
    }

    try {
      await sleep(config.WATCHER_INTERVAL_MS, undefined, { signal: stopping.signal })
    } catch {
      break
    }
  }

  console.log('watcher stopped')
  await handle.close()
}

const runAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (runAsScript) {
  await main()
  process.exit(0)
}
