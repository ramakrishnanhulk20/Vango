// Covers one pass of the watcher against a fake Nimiq node. It does NOT cover the real
// RPC (no network call is made here, so a node that changes its response shape is not
// caught), and it does NOT cover the long-running loop, the 150 ms stagger in practice,
// or the Ctrl+C shutdown.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import type { DbHandle } from '../src/db/client.js'
import { watcherCursors, type User } from '../src/db/schema.js'
import { createCard } from '../src/domain/cards.js'
import type { ChainTransaction } from '../src/nimiq/rpc.js'
import { tick, type WatcherRpc } from '../src/watcher/index.js'
import { clearTables, freshDb, insertUser, randomAddress, randomHash } from './support/db.js'

const HEAD = 11_148_228

let handle: DbHandle
let merchant: User
let customer: User
let receiving: string
let code: string
let chain: ChainTransaction[]
let failNext: boolean

const rpc: WatcherRpc = {
  getBlockNumber: async () => HEAD,
  listIncoming: async (address, sinceBlock) => {
    if (failNext) {
      failNext = false
      throw new Error('rpc unavailable')
    }
    return chain.filter((tx) => tx.recipient === address && tx.blockNumber > sinceBlock)
  },
}

beforeAll(async () => {
  handle = await freshDb()
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  await clearTables(handle.db)
  chain = []
  failNext = false
  merchant = await insertUser(handle.db)
  customer = await insertUser(handle.db)
  receiving = merchant.visibleAddress
  const card = await createCard(
    {
      merchantUserId: merchant.id,
      name: 'Kumar Coffee',
      rewardKind: 'nth_free',
      targetVisits: 5,
      rewardText: 'Free filter coffee',
    },
    handle.db,
  )
  code = card.code
})

function payment(blockNumber: number, changes: Partial<ChainTransaction> = {}): ChainTransaction {
  return {
    hash: randomHash(),
    blockNumber,
    sender: customer.remoteAddress ?? customer.visibleAddress,
    recipient: receiving,
    valueLuna: 100000,
    memo: `vango:${code}`,
    ...changes,
  }
}

async function cursor(): Promise<number | null> {
  const [row] = await handle.db
    .select()
    .from(watcherCursors)
    .where(eq(watcherCursors.receivingAddress, receiving))
  return row?.lastBlock ?? null
}

describe('tick', () => {
  it('watcher tick stamps new payments and advances the cursor', async () => {
    chain.push(payment(HEAD - 5), payment(HEAD - 2), payment(HEAD - 1, { memo: 'hello' }))
    const lines: string[] = []

    const first = await tick({ database: handle.db, rpc, staggerMs: 0, log: (line) => lines.push(line) })

    expect(first).toEqual({ addresses: 1, stamped: 2, refused: 1, failed: 0, expired: 0 })
    expect(await cursor()).toBe(HEAD - 1)
    expect(lines.filter((line) => line.startsWith('stamped'))).toHaveLength(2)

    const second = await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(second).toEqual({ addresses: 1, stamped: 0, refused: 0, failed: 0, expired: 0 })
    expect(await cursor()).toBe(HEAD - 1)

    chain.push(payment(HEAD + 3))
    const third = await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(third.stamped).toBe(1)
    expect(await cursor()).toBe(HEAD + 3)
  })

  it('starts a new address a hundred blocks back, not at the beginning of the chain', async () => {
    await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(await cursor()).toBe(HEAD - 100)
  })

  it('keeps the cursor where it was when the node fails, and catches up next pass', async () => {
    chain.push(payment(HEAD - 4))
    failNext = true

    const failed = await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(failed).toMatchObject({ stamped: 0, failed: 1 })

    const recovered = await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(recovered).toMatchObject({ stamped: 1, failed: 0 })
    expect(await cursor()).toBe(HEAD - 4)
  })

  it('has nothing to watch until a merchant opens a card', async () => {
    await clearTables(handle.db)

    const summary = await tick({ database: handle.db, rpc, staggerMs: 0, log: () => {} })

    expect(summary).toEqual({ addresses: 0, stamped: 0, refused: 0, failed: 0, expired: 0 })
  })
})
