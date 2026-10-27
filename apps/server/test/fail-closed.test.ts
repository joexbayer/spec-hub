import { inspect } from 'node:util'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app.ts'
import { auth } from '../src/auth/auth.ts'
import { db, pool } from '../src/db/client.ts'
import { clone, cloneBranch } from '../src/db/schema.ts'
import { findProjectBySlug } from '../src/services/membership.ts'
import { addMember, createProject, createToken, createUser, sessionCookie, truncateAll } from './helpers.ts'

// Only the membership lookup is replaced, and only when a test arms it; everything else is real.
const failMembership = vi.hoisted(() => ({ armed: false }))
vi.mock('../src/services/membership.ts', async (orig) => {
  const real = await orig<typeof import('../src/services/membership.ts')>()
  return {
    ...real,
    findMembership: (...args: Parameters<typeof real.findMembership>) => {
      if (failMembership.armed) {
        failMembership.armed = false
        return Promise.reject(new Error('db down'))
      }
      return real.findMembership(...args)
    },
  }
})

const TIP = 'a'.repeat(40)
const manifest = (cloneId: string, generatedAt: number, branch: string, dirs: string[] = []) => ({
  cloneId,
  generatedAt,
  commitEmail: 'a@example.test',
  objectFormat: 'sha1',
  default: null,
  branches: [
    {
      name: branch,
      tip: TIP,
      tipAt: 1000,
      pushed: true,
      features: dirs.map((dir) => ({
        dir,
        lastChangeAt: 1000,
        author: null,
        docs: { spec: null, plan: null, tasks: null },
      })),
    },
  ],
})

async function setup() {
  const u = await createUser('alice')
  const p = await createProject('acme')
  await addMember(p, u)
  const { key } = await createToken(u)
  const post = (m: unknown) =>
    app.request('/api/r/acme/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(m),
    })
  return { post }
}

beforeEach(async () => {
  await truncateAll()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(async () => {
  failMembership.armed = false
  vi.restoreAllMocks()
  await db.execute(sql`ALTER TABLE clone_feature DROP CONSTRAINT IF EXISTS t064_fail`)
})

describe('fail closed (SEC-A10)', () => {
  it('answers 500 and writes nothing when token verification throws', async () => {
    const { post } = await setup()
    vi.spyOn(auth.api, 'verifyApiKey').mockRejectedValueOnce(new Error('db down'))
    const res = await post(manifest(crypto.randomUUID(), 100, 'f'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal error' })
    expect(await db.select().from(clone)).toHaveLength(0)
  })

  it('answers 500 and writes nothing when the membership query fails', async () => {
    const { post } = await setup()
    expect(await findProjectBySlug(db, 'acme')).not.toBeNull()
    failMembership.armed = true
    const res = await post(manifest(crypto.randomUUID(), 100, 'f'))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'internal error' })
    expect(await db.select().from(clone)).toHaveLength(0)
  })

  it('rolls back the whole report when it fails inside the transaction', async () => {
    const { post } = await setup()
    const id = crypto.randomUUID()
    expect((await post(manifest(id, 100, 'keep', ['001-a']))).status).toBe(200)
    await db.execute(sql`ALTER TABLE clone_feature ADD CONSTRAINT t064_fail CHECK (dir <> 'boom')`)
    const res = await post(manifest(id, 200, 'other', ['boom']))
    expect(res.status).toBe(500)
    expect(await db.select().from(cloneBranch)).toMatchObject([{ name: 'keep' }])
    const [c] = await db.select().from(clone).where(eq(clone.id, id))
    expect(c?.generatedAt).toBe(100)
  })

  it('reports 503 from /healthz when the pool query fails', async () => {
    vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('down') as never)
    const res = await app.request('/healthz')
    expect(res.status).toBe(503)
    expect(await res.text()).toBe('unavailable')
  })

  it('logs a failed query on a cookie route without the session token', async () => {
    const u = await createUser('alice')
    const cookie = await sessionCookie(u)
    const token = decodeURIComponent(cookie.split('=')[1] ?? '').split('.')[0] ?? ''
    expect(token.length).toBeGreaterThan(10)
    const lines: unknown[][] = []
    for (const level of ['error', 'warn', 'log', 'info', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        lines.push(args)
      })
    }
    vi.spyOn(pool, 'query').mockRejectedValue(new Error('connection terminated') as never)
    const res = await app.request('/api/me', { headers: { cookie } })
    expect(res.status).toBe(500)
    expect(lines.length).toBeGreaterThan(0)
    for (const args of lines) expect(inspect(args, { depth: 10 })).not.toContain(token)
  })
})
