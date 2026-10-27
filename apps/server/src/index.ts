import { serve } from '@hono/node-server'
import { app } from './app.ts'
import { db, pool } from './db/client.ts'
import { runMigrations } from './db/migrate.ts'
import { env } from './env.ts'

await runMigrations(db)
console.log('migrations applied')

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) =>
  console.log(`spec-hub listening on :${info.port}`),
)

async function shutdown() {
  server.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
