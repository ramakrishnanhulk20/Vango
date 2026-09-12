import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KeyPair, PrivateKey } from '@nimiq/core'
import { config } from '../config.js'
import { createDb, serverRoot, type Db } from '../db/client.js'
import { applyMigrations } from '../db/migrate.js'
import { users, type Card, type User } from '../db/schema.js'
import { cardByCode, createCard } from '../domain/cards.js'
import { normalizeAddress } from '../lib/address.js'

/**
 * Where the demo card's code is remembered between runs. The card code alphabet has no
 * vowels in it (see src/lib/code.ts), so a readable fixed code like VANGODEMO cannot be
 * used: the first generated code is kept here instead and reused on every later run.
 * The folder is git-ignored, so a judge's clone seeds its own card.
 */
export const seedFile = resolve(serverRoot, '.data/seed.json')

export const DEMO_CARD = {
  name: 'Vango Demo Cafe',
  rewardKind: 'nth_free',
  targetVisits: 3,
  minLuna: 100000,
  rewardText: 'Free coffee',
} as const

export type SeededDemo = {
  merchant: User
  card: Card
  memo: string
  /** False when this run found the card from an earlier run and changed nothing. */
  created: boolean
}

type SeedFile = { cardCode: string; receivingAddress: string; seededAt: string }

function readSeedFile(): SeedFile | null {
  try {
    const parsed = JSON.parse(readFileSync(seedFile, 'utf8')) as Partial<SeedFile>
    if (typeof parsed.cardCode !== 'string' || parsed.cardCode.length === 0) return null
    return parsed as SeedFile
  } catch {
    return null
  }
}

function writeSeedFile(card: Card): void {
  mkdirSync(dirname(seedFile), { recursive: true })
  const body: SeedFile = {
    cardCode: card.code,
    receivingAddress: card.receivingAddress,
    seededAt: new Date().toISOString(),
  }
  writeFileSync(seedFile, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
}

/** The address the merchant key in .env pays into and is paid at. */
export function merchantKeyAddress(): string {
  const keyPair = KeyPair.derive(PrivateKey.fromHex(config.SPIKE_MERCHANT_PRIVATE_KEY))
  const address = normalizeAddress(keyPair.toAddress().toUserFriendlyAddress())
  if (!address) throw new Error('the merchant key did not produce a Nimiq address')
  return address
}

/**
 * Puts the demo merchant and their card in the database, or finds what an earlier run
 * put there. Running it twice gives the same card code, so the QR code on a printed
 * demo card keeps working and a second run never doubles the data a judge sees.
 */
export async function seedDemo(database: Db): Promise<SeededDemo> {
  const visibleAddress = merchantKeyAddress()

  const [merchant] = await database
    .insert(users)
    .values({ visibleAddress })
    .onConflictDoUpdate({ target: users.visibleAddress, set: { lastSeenAt: new Date() } })
    .returning()

  if (!merchant) throw new Error('could not create the demo merchant')

  const remembered = readSeedFile()
  if (remembered) {
    const existing = await cardByCode(remembered.cardCode, database)
    if (existing) return { merchant, card: existing, memo: `vango:${existing.code}`, created: false }
  }

  const card = await createCard({ merchantUserId: merchant.id, ...DEMO_CARD }, database)

  writeSeedFile(card)

  return { merchant, card, memo: `vango:${card.code}`, created: true }
}

async function main(): Promise<void> {
  const handle = createDb()
  try {
    const migrations = await applyMigrations(handle)
    for (const name of migrations.applied) console.log(`applied migration ${name}`)

    const seeded = await seedDemo(handle.db)

    console.log(seeded.created ? 'seeded the demo card' : 'demo card was already there')
    console.log(`card       ${seeded.card.name}`)
    console.log(`code       ${seeded.card.code}`)
    console.log(`reward     ${seeded.card.rewardText} on visit ${seeded.card.targetVisits}`)
    console.log(`pay to     ${seeded.card.receivingAddress}`)
    console.log(`memo       ${seeded.memo}`)
    console.log(`minimum    ${seeded.card.minLuna} Luna per payment`)
  } finally {
    await handle.close()
  }
}

const runAsScript = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (runAsScript) {
  await main()
  process.exit(0)
}
