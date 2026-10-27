import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Db } from './client.ts'
import { db, pool } from './client.ts'

export async function runMigrations(database: Db): Promise<void> {
  await migrate(database, {
    migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)),
  })
}

const isMain = import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)

if (isMain) {
  try {
    await runMigrations(db)
    console.log('migrations applied')
    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}
