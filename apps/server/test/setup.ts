import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import pg from 'pg'

// Must be a plain identifier: it is interpolated into DROP/CREATE DATABASE.
const testDb = process.env.SPECHUB_TEST_DB ?? 'spechub_test'
if (!/^[a-z_][a-z0-9_]*$/.test(testDb)) throw new Error('SPECHUB_TEST_DB must match [a-z_][a-z0-9_]*')

export default async function setup(): Promise<void> {
  const admin = new pg.Client({
    connectionString: process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://localhost/postgres',
  })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${testDb} WITH (FORCE)`)
    await admin.query(`CREATE DATABASE ${testDb}`)
  } finally {
    await admin.end()
  }

  const pool = new pg.Pool({ connectionString: `postgres://localhost/${testDb}`, max: 1 })
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../src/db/migrations', import.meta.url)),
    })
  } finally {
    await pool.end()
  }
}
