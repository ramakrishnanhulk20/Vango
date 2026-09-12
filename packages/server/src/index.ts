import { networkInterfaces } from 'node:os'
import { buildApp, merchantAddress } from './app.js'
import { config } from './config.js'
import { sharedHandle } from './db/client.js'
import { applyMigrations } from './db/migrate.js'

function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address)
}

const handle = sharedHandle()
const migrations = await applyMigrations(handle)

const app = await buildApp({ database: handle.db })

for (const name of migrations.applied) app.log.info(`applied migration ${name}`)

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' })
  app.log.info(
    { merchant: merchantAddress(), network: config.NIMIQ_NETWORK, database: handle.kind },
    'vango api ready',
  )
  for (const ip of lanAddresses()) {
    app.log.info(`open on the phone: http://${ip}:${config.PORT}/spike`)
  }
} catch (error) {
  app.log.error({ err: error }, 'failed to start')
  process.exit(1)
}
