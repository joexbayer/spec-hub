import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/app-env.ts'
import { requireMember, requireToken } from '../src/auth/bearer.ts'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature, membership, securityEvent } from '../src/db/schema.ts'
import {
  addMember,
  createProject,
  createToken,
  createUser,
  jsonRequest,
  sessionCookie,
  stubGithub,
  truncateAll,
} from './helpers.ts'

afterEach(() => {
  vi.restoreAllMocks()
})

beforeEach(async () => {
  await truncateAll()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

async function setup() {
  const admin = await createUser('ann')
  const p = await createProject('acme')
  await addMember(p, admin, 'admin')
  const cookie = { cookie: await sessionCookie(admin) }
  return { admin, p, cookie }
}

const members = async (cookie: { cookie: string }) =>
  (await (await jsonRequest('/api/projects/acme/members', 'GET', undefined, cookie)).json()) as {
    githubId: string
    githubLogin: string
    userId: string | null
    role: string
    pending: boolean
  }[]
const assign = (githubLogin: string, cookie: { cookie: string }, role = 'member') =>
  jsonRequest('/api/projects/acme/members', 'POST', { githubLogin, role }, cookie)

describe('assigning people', () => {
  it('assigns by GitHub username, resolved to the account id, audited; duplicates 409, bad body 422', async () => {
    const { cookie } = await setup()
    const bob = await createUser('bob')
    const github = stubGithub({ bob: bob.githubId })
    const res = await assign('Bob', cookie)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      githubId: bob.githubId,
      githubLogin: 'bob',
      role: 'member',
      pending: false,
    })
    expect(String(github.mock.calls[0]?.[0])).toBe('http://github.test/users/Bob')
    expect(await members(cookie)).toMatchObject([
      { githubLogin: 'ann', role: 'admin', pending: false },
      { githubId: bob.githubId, userId: bob.id, githubLogin: 'bob', role: 'member', pending: false },
    ])
    expect((await assign('bob', cookie, 'admin')).status).toBe(409)
    const bad = await jsonRequest(
      '/api/projects/acme/members',
      'POST',
      { userId: bob.id, role: 'admin' },
      cookie,
    )
    expect(bad.status).toBe(422)
    expect((await assign('-x y', cookie)).status).toBe(422)
    const events = await db.select().from(securityEvent).where(eq(securityEvent.type, 'member_added'))
    expect(events.map((e) => e.detail)).toEqual([
      { githubLogin: 'bob', githubId: bob.githubId, role: 'member' },
    ])
  })

  it('assigns someone who has never signed in as pending', async () => {
    const { cookie } = await setup()
    stubGithub({ dave: '4242' })
    const res = await assign('dave', cookie)
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ githubId: '4242', githubLogin: 'dave', pending: true })
    expect((await members(cookie)).find((m) => m.githubId === '4242')).toMatchObject({
      githubLogin: 'dave',
      userId: null,
      pending: true,
    })
  })

  it('answers 404 for an unknown username and 502 when GitHub is unreachable or failing', async () => {
    const { cookie } = await setup()
    stubGithub({})
    const unknown = await assign('nobody-here', cookie)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toEqual({ error: 'no GitHub user @nobody-here' })
    for (const down of ['down', 500] as const) {
      stubGithub(down)
      const res = await assign('bob', cookie)
      expect(res.status).toBe(502)
      expect(await res.json()).toEqual({ error: "couldn't reach GitHub" })
    }
    expect(await db.select().from(membership)).toHaveLength(1)
  })

  it('refuses non-admins', async () => {
    const { p } = await setup()
    const u = await createUser('bob')
    await addMember(p, u)
    const cookie = { cookie: await sessionCookie(u) }
    expect((await jsonRequest('/api/projects/acme/members', 'GET', undefined, cookie)).status).toBe(403)
    const github = stubGithub({})
    const add = await jsonRequest(
      '/api/projects/acme/members',
      'POST',
      { githubLogin: 'carol', role: 'member' },
      cookie,
    )
    expect(github).not.toHaveBeenCalled()
    expect(add.status).toBe(403)
  })
})

describe('role changes and removal', () => {
  it('protects the last admin from demotion and removal', async () => {
    const { admin, cookie } = await setup()
    const demote = await jsonRequest(
      `/api/projects/acme/members/${admin.githubId}`,
      'PATCH',
      { role: 'member' },
      cookie,
    )
    expect(demote.status).toBe(409)
    expect(await demote.json()).toEqual({ error: 'a project needs at least one admin' })
    expect(
      (await jsonRequest(`/api/projects/acme/members/${admin.githubId}`, 'DELETE', undefined, cookie)).status,
    ).toBe(409)
  })

  it('changes a role and audits it', async () => {
    const { admin, p, cookie } = await setup()
    const bob = await createUser('bob')
    await addMember(p, bob)
    expect(
      (await jsonRequest(`/api/projects/acme/members/${bob.githubId}`, 'PATCH', { role: 'admin' }, cookie))
        .status,
    ).toBe(200)
    // now ann is no longer the last admin
    expect(
      (await jsonRequest(`/api/projects/acme/members/${admin.githubId}`, 'PATCH', { role: 'member' }, cookie))
        .status,
    ).toBe(200)
    const events = await db.select().from(securityEvent).where(eq(securityEvent.type, 'role_changed'))
    expect(events).toHaveLength(2)
  })

  it('removes a member with their clones, and their token stops working', async () => {
    const { p, cookie } = await setup()
    const bob = await createUser('bob')
    await addMember(p, bob)
    const cloneId = crypto.randomUUID()
    const now = new Date()
    await db.insert(clone).values({
      id: cloneId,
      projectId: p.id,
      userId: bob.id,
      commitEmail: 'bob@example.test',
      generatedAt: 1,
      reportedAt: now,
    })
    await db
      .insert(cloneBranch)
      .values({ cloneId, name: 'f', tip: 'a'.repeat(40), tipAt: now, pushed: false })
    await db.insert(cloneFeature).values({ cloneId, branch: 'f', dir: '001-x', lastChangeAt: now })

    const probe = new Hono<AppEnv>().get('/p/:slug/report', requireToken('report'), requireMember(), (c) =>
      c.json({ ok: true }),
    )
    const { key } = await createToken(bob)
    const call = () => probe.request('/p/acme/report', { headers: { Authorization: `Bearer ${key}` } })
    expect((await call()).status).toBe(200)

    expect(
      (await jsonRequest(`/api/projects/acme/members/${bob.githubId}`, 'DELETE', undefined, cookie)).status,
    ).toBe(204)
    expect(await db.select().from(membership).where(eq(membership.userId, bob.id))).toHaveLength(0)
    expect(await db.select().from(clone)).toHaveLength(0)
    expect(await db.select().from(cloneBranch)).toHaveLength(0)
    expect(await db.select().from(cloneFeature)).toHaveLength(0)
    expect((await call()).status).toBe(403)
    expect(
      await db.select().from(securityEvent).where(eq(securityEvent.type, 'member_removed')),
    ).toHaveLength(1)
  })
})

describe('security events', () => {
  it('pages newest first with an exclusive before cursor', async () => {
    const { admin, p, cookie } = await setup()
    for (let i = 0; i < 3; i++) {
      await db.insert(securityEvent).values({ type: 'token_created', actorUserId: admin.id, projectId: p.id })
    }
    const res = await jsonRequest('/api/projects/acme/security-events', 'GET', undefined, cookie)
    const page = (await res.json()) as {
      events: { id: number; type: string; actorLogin: string | null; scope: string }[]
      next: number | null
    }
    expect(page.events.map((e) => e.id)).toEqual([...page.events.map((e) => e.id)].sort((a, b) => b - a))
    // three project events, then the hub-level sign_in the admin's session wrote
    expect(page.events.map((e) => [e.type, e.scope])).toEqual([
      ['token_created', 'project'],
      ['token_created', 'project'],
      ['token_created', 'project'],
      ['sign_in', 'person'],
    ])
    expect(page.events.every((e) => e.actorLogin === 'ann')).toBe(true)
    expect(page.next).toBeNull()
    const before = page.events[1]?.id
    const older = await jsonRequest(
      `/api/projects/acme/security-events?before=${before}`,
      'GET',
      undefined,
      cookie,
    )
    const o = (await older.json()) as { events: { id: number }[] }
    expect(o.events.map((e) => e.id)).toEqual([page.events[2]?.id, page.events[3]?.id])
  })

  it("includes members' hub-level events, not other projects' members'", async () => {
    const { admin, p, cookie } = await setup()
    const bob = await createUser('bob')
    const zed = await createUser('zed')
    await addMember(p, bob)
    const other = await createProject('other')
    await addMember(other, zed)
    await db.insert(securityEvent).values([
      { type: 'token_created', actorUserId: bob.id, projectId: null },
      { type: 'token_created', actorUserId: zed.id, projectId: null },
      { type: 'member_added', actorUserId: zed.id, projectId: other.id },
      { type: 'member_added', actorUserId: admin.id, projectId: p.id },
      { type: 'test_system', actorUserId: null, projectId: null },
    ])
    const res = await jsonRequest('/api/projects/acme/security-events', 'GET', undefined, cookie)
    const page = (await res.json()) as {
      events: { type: string; actorLogin: string | null; scope: string }[]
    }
    expect(page.events.map((e) => [e.type, e.actorLogin, e.scope])).toEqual([
      ['member_added', 'ann', 'project'],
      ['token_created', 'bob', 'person'],
      ['sign_in', 'ann', 'person'],
    ])
  })
})
