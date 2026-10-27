import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { app } from '../src/app.ts'
import type { AppEnv } from '../src/app-env.ts'
import { auth } from '../src/auth/auth.ts'
import { requireMember, requireToken } from '../src/auth/bearer.ts'
import { db } from '../src/db/client.ts'
import { membership, securityEvent } from '../src/db/schema.ts'
import {
  addMember,
  createProject,
  createToken,
  createUser,
  jsonRequest,
  ORIGIN,
  sessionCookie,
  truncateAll,
} from './helpers.ts'

const handler = (c: { var: AppEnv['Variables']; json: (b: unknown) => Response }) =>
  c.json({ ok: true, userId: c.var.userId, project: c.var.project.slug })

const probe = new Hono<AppEnv>()
  .get('/p/:slug/report', requireToken('report'), requireMember(), handler)
  .get('/p/:slug/read', requireToken('read'), requireMember(), handler)
  .get('/p/:slug/admin', requireToken('report'), requireMember('admin'), handler)

const get = (path: string, key?: string) =>
  probe.request(path, key ? { headers: { Authorization: `Bearer ${key}` } } : {})

beforeEach(async () => {
  await truncateAll()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('bearer token boundary', () => {
  it('rejects missing, malformed, unknown and revoked tokens with 401', async () => {
    const u = await createUser('alice')
    const p = await createProject('acme')
    await addMember(p, u)
    const { key, id } = await createToken(u)

    expect((await get('/p/acme/report')).status).toBe(401)
    expect((await get('/p/acme/report', 'short')).status).toBe(401)
    expect((await get('/p/acme/report', `sh_${'a'.repeat(40)}`)).status).toBe(401)

    expect((await get('/p/acme/report', key)).status).toBe(200)
    await auth.api.deleteApiKey({ body: { keyId: id }, headers: { cookie: await sessionCookie(u) } })
    expect((await get('/p/acme/report', key)).status).toBe(401)
  })

  it('refuses a valid token from a non-member with 403', async () => {
    const u = await createUser('alice')
    await createProject('acme')
    const { key } = await createToken(u)
    const res = await get('/p/acme/report', key)
    expect(res.status).toBe(403)
  })

  it('refuses a token lacking the route permission', async () => {
    const u = await createUser('alice')
    const p = await createProject('acme')
    await addMember(p, u)
    const { key } = await createToken(u, { hub: ['read'] })
    const res = await get('/p/acme/report', key)
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'token lacks permission' })
    expect((await get('/p/acme/read', key)).status).toBe(200)
  })

  it('lets a member through with the right identity and project', async () => {
    const u = await createUser('alice')
    const p = await createProject('acme')
    await addMember(p, u)
    const { key } = await createToken(u)
    const res = await get('/p/acme/report', key)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, userId: u.id, project: 'acme' })
  })

  it('requires the admin role on admin routes', async () => {
    const m = await createUser('member')
    const a = await createUser('boss')
    const p = await createProject('acme')
    await addMember(p, m)
    await addMember(p, a, 'admin')
    expect((await get('/p/acme/admin', (await createToken(m)).key)).status).toBe(403)
    expect((await get('/p/acme/admin', (await createToken(a)).key)).status).toBe(200)
  })

  it('returns 404 for an unknown project', async () => {
    const u = await createUser('alice')
    const { key } = await createToken(u)
    expect((await get('/p/nope/report', key)).status).toBe(404)
  })

  it('applies membership removal immediately', async () => {
    const u = await createUser('alice')
    const p = await createProject('acme')
    await addMember(p, u)
    const { key } = await createToken(u)
    expect((await get('/p/acme/report', key)).status).toBe(200)
    await db.delete(membership).where(eq(membership.projectId, p.id))
    expect((await get('/p/acme/report', key)).status).toBe(403)
  })
})

describe('app boundaries', () => {
  it('hides the plugin api-key routes', async () => {
    const u = await createUser('alice')
    const res = await jsonRequest(
      '/api/auth/api-key/create',
      'POST',
      { name: 'x' },
      {
        cookie: await sessionCookie(u),
      },
    )
    expect(res.status).toBe(404)
  })

  it('caps bodies at 64 KiB outside the reporter routes, before any auth', async () => {
    const pad = 'x'.repeat(70 * 1024)
    for (const path of ['/api/auth/sign-in/social', '/api/projects', '/mcp/acme']) {
      const res = await jsonRequest(path, 'POST', { pad })
      expect(res.status).toBe(413)
      expect(await res.json()).toEqual({ error: 'request body too large' })
    }
    // no Content-Length: the streamed bytes are counted
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(pad))
        c.close()
      },
    })
    const chunked = await app.request(
      new Request(`${ORIGIN}/api/auth/sign-in/social`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
        body: stream,
        duplex: 'half',
      } as RequestInit),
    )
    expect(chunked.status).toBe(413)
    // the reporter routes keep their own, larger limit after token auth
    const reporter = await jsonRequest('/api/r/acme/reports', 'POST', { pad })
    expect(reporter.status).toBe(401)
  })

  it('refuses cookie-bearing mutations from a foreign origin', async () => {
    const res = await jsonRequest('/api/anything', 'POST', {}, { Origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross-origin request refused' })
  })
})

describe('security_event is append-only', () => {
  it('rejects UPDATE and DELETE', async () => {
    await db.insert(securityEvent).values({ type: 'test', detail: {} })
    // drizzle wraps the driver error; the trigger message is on `cause`
    for (const stmt of [sql`UPDATE security_event SET type = 'x'`, sql`DELETE FROM security_event`]) {
      await expect(db.execute(stmt)).rejects.toMatchObject({ cause: { message: /append-only/ } })
    }
  })
})
