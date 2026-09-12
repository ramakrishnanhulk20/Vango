import { eq } from 'drizzle-orm'
import { db, type Db } from '../db/client.js'
import { cards, stamps } from '../db/schema.js'
import { progress, type CardProgress } from './stamps.js'

/**
 * One card in a customer's wallet.
 *
 * merchantName is optional because a merchant is a wallet, not a profile: until a
 * merchant tells us their trading name the card's own name is all there is to show.
 */
export type HeldCard = {
  code: string
  name: string
  rewardText: string
  rewardKind: 'nth_free' | 'cashback'
  merchantName?: string
  progress: CardProgress
}

/**
 * Every card this wallet has ever been stamped on, with where it stands today. A card
 * stays in the wallet after its reward is taken, because the next visit starts it again.
 */
export async function heldCards(userId: string, database: Db = db()): Promise<HeldCard[]> {
  const rows = await database
    .selectDistinct({ card: cards })
    .from(stamps)
    .innerJoin(cards, eq(cards.id, stamps.cardId))
    .where(eq(stamps.customerUserId, userId))

  const held: HeldCard[] = []
  for (const row of rows) {
    held.push({
      code: row.card.code,
      name: row.card.name,
      rewardText: row.card.rewardText,
      rewardKind: row.card.rewardKind as 'nth_free' | 'cashback',
      progress: await progress(row.card.id, userId, database),
    })
  }

  return held.sort((a, b) => a.name.localeCompare(b.name))
}
