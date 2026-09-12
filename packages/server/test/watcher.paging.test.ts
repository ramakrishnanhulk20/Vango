// Covers reading one busy address across several pages of the node's history. It does
// NOT make a network call (the pages come from a fake node), and it does NOT prove the
// live node's own ordering or its exact paging parameter, which the spike confirmed by
// hand against a real transaction.

import { describe, expect, it } from 'vitest'
import { KeyPair } from '@nimiq/core'
import { listIncoming, MAX_PAGES, type PageFetcher, type RpcTransaction } from '../src/nimiq/rpc.js'
import { randomHash } from './support/db.js'

const address = KeyPair.generate().toAddress().toUserFriendlyAddress().replace(/\s+/g, '')

function transaction(blockNumber: number, to: string = address): RpcTransaction {
  return {
    hash: randomHash(),
    blockNumber,
    timestamp: 1_789_000_000,
    confirmations: 5,
    from: KeyPair.generate().toAddress().toUserFriendlyAddress(),
    fromType: 0,
    to,
    toType: 0,
    value: 100000,
    fee: 0,
    senderData: '',
    recipientData: Buffer.from('vango:9BCDFGHJ', 'utf8').toString('hex'),
    validityStartHeight: blockNumber - 1,
    networkId: 5,
  }
}

/** A node that answers newest first and walks backwards from the hash it is handed. */
function nodeWith(history: RpcTransaction[]): { fetchPage: PageFetcher; calls: () => number } {
  const newestFirst = [...history].sort((a, b) => b.blockNumber - a.blockNumber)
  let calls = 0

  const fetchPage: PageFetcher = async (_address, max, beforeHash) => {
    calls += 1
    const start = beforeHash === null ? 0 : newestFirst.findIndex((tx) => tx.hash === beforeHash) + 1
    return newestFirst.slice(start, start + max)
  }

  return { fetchPage, calls: () => calls }
}

describe('listIncoming', () => {
  it('reads a busy address across more than one page', async () => {
    const history = Array.from({ length: 501 }, (_unused, index) => transaction(11_000_000 + index))
    const node = nodeWith(history)

    const found = await listIncoming(address, 0, { pageSize: 500, fetchPage: node.fetchPage })

    expect(found).toHaveLength(501)
    expect(node.calls()).toBe(2)
    expect(found[0]?.blockNumber).toBe(11_000_000)
    expect(found.at(-1)?.blockNumber).toBe(11_000_500)
    expect(new Set(found.map((tx) => tx.hash)).size).toBe(501)
  })

  it('stops as soon as a page reaches back past the cursor', async () => {
    const history = Array.from({ length: 501 }, (_unused, index) => transaction(11_000_000 + index))
    const node = nodeWith(history)

    const found = await listIncoming(address, 11_000_400, { pageSize: 500, fetchPage: node.fetchPage })

    expect(found).toHaveLength(100)
    expect(node.calls()).toBe(1)
  })

  it('drops payments that went somewhere else and never loops forever', async () => {
    const elsewhere = KeyPair.generate().toAddress().toUserFriendlyAddress().replace(/\s+/g, '')
    const history = [transaction(11_000_001), transaction(11_000_002, elsewhere)]
    const node = nodeWith(history)

    const found = await listIncoming(address, 0, { pageSize: 2, fetchPage: node.fetchPage })

    expect(found).toHaveLength(1)
    expect(node.calls()).toBeLessThanOrEqual(MAX_PAGES)
  })
})
