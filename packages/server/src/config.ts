import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')

loadEnv({ path: resolve(repoRoot, '.env'), quiet: true })

/** A key left blank in .env arrives as an empty string, which means "not set". */
const blankIsMissing = <T extends z.ZodType>(inner: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), inner)

const schema = z.object({
  NIMIQ_RPC_URL: z.url(),
  NIMIQ_NETWORK: z.enum(['TestAlbatross', 'MainAlbatross']),
  SPIKE_MERCHANT_PRIVATE_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters'),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  DATABASE_URL: blankIsMissing(z.string().min(1).optional()),
  WATCHER_INTERVAL_MS: blankIsMissing(z.coerce.number().int().min(250).max(600000).default(3000)),
  ALLOWED_ORIGINS: blankIsMissing(z.string().min(1).optional()),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
  throw new Error(`Bad or missing environment in ${resolve(repoRoot, '.env')}\n${lines.join('\n')}`)
}

export const config = parsed.data
export { repoRoot }

/** Browser origins allowed to call the API. Empty means same-origin only. */
export function allowedOrigins(): string[] {
  return (config.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
}
