import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { apikey, securityEvent } from '../src/db/schema.ts'
import {
  addMember,
  createProject,
  createToken,
  createUser,
  jsonRequest,
  request,
  sessionCookie,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)

async function setup() {
  const u = await createUser('amy')
  const p = await createProject('acme')
  await addMember(p, u)
  return { u, p, cookie: { cookie: await sessionCookie(u) } }
}

type Created = { id: string; name: string; key: string; start: string | null; createdAt: string }

describe('token routes', () => {
  it('creates a working key, lists it without key material, revokes it, and audits without the key', async () => {
    const { cookie } = await setup()
    const res = await jsonRequest('/api/tokens', 'POST', { name: ' laptop ' }, cookie)
    expect(res.status).toBe(201)
    const created = (await res.json()) as Created
    expect(created.name).toBe('laptop')
    expect(created.key).toMatch(/^sh_/)

    const bearer = { authorization: `Bearer ${created.key}` }
    expect((await request('/api/r/acme/config', { headers: bearer })).status).toBe(200)

    const listRes = await request('/api/tokens', { headers: cookie })
    expect(listRes.status).toBe(200)
    const text = await listRes.text()
    expect(text).not.toContain(created.key)
    const list = JSON.parse(text) as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('key')
    expect(Object.keys(list[0] ?? {}).sort()).toEqual(
      ['createdAt', 'id', 'lastRequest', 'name', 'start'].sort(),
    )

    const del = await jsonRequest(`/api/tokens/${created.id}`, 'DELETE', undefined, cookie)
    expect(del.status).toBe(204)
    expect((await request('/api/r/acme/config', { headers: bearer })).status).toBe(401)

    const events = await db.select().from(securityEvent)
    const types = events.map((e) => e.type)
    expect(types).toContain('token_created')
    expect(types).toContain('token_revoked')
    expect(JSON.stringify(events)).not.toContain(created.key)
  })

  it("404s when deleting another user's key", async () => {
    const { cookie } = await setup()
    const bob = await createUser('bob')
    const theirs = await createToken(bob)
    const del = await jsonRequest(`/api/tokens/${theirs.id}`, 'DELETE', undefined, cookie)
    expect(del.status).toBe(404)
    expect((await request('/api/tokens', { headers: { cookie: await sessionCookie(bob) } })).status).toBe(200)
  })

  it('rejects a 33-char name with 422', async () => {
    const { cookie } = await setup()
    const res = await jsonRequest('/api/tokens', 'POST', { name: 'x'.repeat(33) }, cookie)
    expect(res.status).toBe(422)
  })

  it('refuses a cross-origin POST', async () => {
    const { cookie } = await setup()
    const res = await jsonRequest(
      '/api/tokens',
      'POST',
      { name: 'x' },
      { ...cookie, Origin: 'http://evil.test' },
    )
    expect(res.status).toBe(403)
  })

  it('requires a session', async () => {
    expect((await request('/api/tokens')).status).toBe(401)
  })

  it('stores only a hash of the key (constitution Art. 5.3)', async () => {
    const { cookie } = await setup()
    const res = await jsonRequest('/api/tokens', 'POST', { name: 'hash check' }, cookie)
    const created = (await res.json()) as Created
    const [row] = await db.select().from(apikey).where(eq(apikey.id, created.id))
    expect(row).toBeDefined()
    expect(row?.key).not.toBe(created.key)
    expect(JSON.stringify(row)).not.toContain(created.key)
  })
})
