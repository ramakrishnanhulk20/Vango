import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

const here = dirname(fileURLToPath(import.meta.url))
export const serverRoot = resolve(here, '../..')
const defaultDataDir = resolve(serverRoot, '.data/vango')

/**
 * Both drivers build the same SQL and expose the same query builder; they differ only
 * in the raw row type of db.execute(), which nothing outside this file uses. Presenting
 * one type keeps every query in the server written once.
 */
export type Db = PgliteDatabase<typeof schema>

export type DbHandle = {
  db: Db
  kind: 'pglite' | 'postgres'
  close: () => Promise<void>
}

export type DbTarget = {
  /** A Postgres connection string. Falls back to DATABASE_URL from the environment. */
  url?: string | undefined
  /** Where PGlite keeps its files. Pass 'memory://' for a throwaway database. */
  dataDir?: string | undefined
}

export function createDb(target: DbTarget = {}): DbHandle {
  const url = target.url ?? (target.dataDir ? undefined : config.DATABASE_URL)

  if (url) {
    const sql = postgres(url, { max: 4, onnotice: () => {} })
    return {
      db: drizzlePostgres(sql, { schema }) as unknown as Db,
      kind: 'postgres',
      close: async () => {
        await sql.end({ timeout: 5 })
      },
    }
  }

  const dataDir = target.dataDir ?? defaultDataDir
  // PGlite opens the folder but does not create the path above it.
  if (!dataDir.startsWith('memory://')) mkdirSync(dataDir, { recursive: true })

  const client = new PGlite(dataDir)
  return {
    db: drizzlePglite(client, { schema }),
    kind: 'pglite',
    close: () => client.close(),
  }
}

/** A fresh empty database that lives only in memory. Used by the tests. */
export function createMemoryDb(): DbHandle {
  return createDb({ dataDir: 'memory://' })
}

let shared: DbHandle | null = null

/** The one database the API and the watcher use. Opened on first call. */
export function db(): Db {
  shared ??= createDb()
  return shared.db
}

export function sharedHandle(): DbHandle {
  shared ??= createDb()
  return shared
}

export async function closeDb(): Promise<void> {
  if (!shared) return
  const handle = shared
  shared = null
  await handle.close()
}
