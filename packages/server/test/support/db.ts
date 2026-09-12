import { randomBytes } from 'node:crypto'
import { KeyPair } from '@nimiq/core'
import { createMemoryDb, type Db, type DbHandle } from '../../src/db/client.js'
import { applyMigrations } from '../../src/db/migrate.js'
import {
  cards,
  challenges,
  redemptions,
  sessions,
  stamps,
  users,
  watcherCursors,
  type User,
} from '../../src/db/schema.js'

/** A Postgres that lives only in this test process, with the real migrations applied. */
export async function freshDb(): Promise<DbHandle> {
  const handle = createMemoryDb()
  await applyMigrations(handle)
  return handle
}

export async function clearTables(database: Db): Promise<void> {
  await database.delete(stamps)
  await database.delete(redemptions)
  await database.delete(cards)
  await database.delete(sessions)
  await database.delete(users)
  await database.delete(watcherCursors)
  await database.delete(challenges)
}

/** A real Nimiq address, checksum and all, so nothing here passes on a fake one. */
export function randomAddress(): string {
  return KeyPair.generate().toAddress().toUserFriendlyAddress().replace(/\s+/g, '')
}

export function randomHash(): string {
  return randomBytes(32).toString('hex')
}

export async function insertUser(
  database: Db,
  addresses: { visible?: string; remote?: string | null } = {},
): Promise<User> {
  const [row] = await database
    .insert(users)
    .values({
      visibleAddress: addresses.visible ?? randomAddress(),
      remoteAddress: addresses.remote === undefined ? randomAddress() : addresses.remote,
    })
    .returning()

  if (!row) throw new Error('could not insert the test user')
  return row
}
