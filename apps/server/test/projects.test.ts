import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature, membership, project, securityEvent } from '../src/db/schema.ts'
import {
  addMember,
  createProject,
  createUser,
  HUB_ADMIN_ID,
  jsonRequest,
  request,
  sessionCookie,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)

const body = { slug: 'acme', name: 'Acme' }

describe('projects', () => {
  it('refuses a non-hub-admin', async () => {
    const cookie = await sessionCookie(await createUser('alice'))
    expect((await jsonRequest('/api/projects', 'POST', body, { cookie })).status).toBe(403)
  })

  it('lets a hub admin create a project with an admin membership and an audit row', async () => {
    const hub = await createUser('hubadmin', { githubId: HUB_ADMIN_ID })
    const cookie = await sessionCookie(hub)
    const res = await jsonRequest('/api/projects', 'POST', body, { cookie })
    expect(res.status).toBe(201)
    const p = (await res.json()) as { id: string; defaultBranch: string; numbering: string }
    expect(p.defaultBranch).toBe('main')
    expect(p.numbering).toBe('sequential')
    const [m] = await db.select().from(membership).where(eq(membership.projectId, p.id))
    expect(m).toMatchObject({ userId: hub.id, role: 'admin' })
    const events = await db.select().from(securityEvent).where(eq(securityEvent.type, 'project_created'))
    expect(events).toHaveLength(1)

    const list = await jsonRequest('/api/projects', 'GET', undefined, { cookie })
    expect(await list.json()).toMatchObject([{ slug: 'acme', memberCount: 1, featureCount: 0 }])
  })

  it('counts members and distinct features carried on branches', async () => {
    const hub = await createUser('hubadmin', { githubId: HUB_ADMIN_ID })
    const cookie = await sessionCookie(hub)
    const p = await createProject('acme')
    await addMember(p, hub)
    const cloneId = crypto.randomUUID()
    await db.insert(clone).values({
      id: cloneId,
      projectId: p.id,
      userId: hub.id,
      commitEmail: 'h@laptop.test',
      generatedAt: Date.now(),
      reportedAt: new Date(),
    })
    for (const branch of ['a', 'b']) {
      await db
        .insert(cloneBranch)
        .values({ cloneId, name: branch, tip: 'abc', tipAt: new Date(), pushed: true })
    }
    // 001 is on two branches and counts once
    for (const [branch, dir] of [
      ['a', '001-one'],
      ['b', '001-one'],
      ['b', '002-two'],
    ] as const) {
      await db.insert(cloneFeature).values({
        cloneId,
        branch,
        dir,
        lastChangeAt: new Date(),
        authorName: 'H',
        authorEmail: 'h@laptop.test',
      })
    }
    const list = await jsonRequest('/api/projects', 'GET', undefined, { cookie })
    expect(await list.json()).toMatchObject([{ slug: 'acme', memberCount: 1, featureCount: 2 }])
  })

  it('rejects a duplicate slug with 409 and a bad slug with 422', async () => {
    const cookie = await sessionCookie(await createUser('hubadmin', { githubId: HUB_ADMIN_ID }))
    expect((await jsonRequest('/api/projects', 'POST', body, { cookie })).status).toBe(201)
    expect((await jsonRequest('/api/projects', 'POST', body, { cookie })).status).toBe(409)
    expect(
      (await jsonRequest('/api/projects', 'POST', { ...body, slug: 'Bad Slug' }, { cookie })).status,
    ).toBe(422)
    expect(
      (await jsonRequest('/api/projects', 'POST', { ...body, defaultBranch: 'a..b' }, { cookie })).status,
    ).toBe(422)
  })

  it('lets only a project admin patch, and audits the changed fields', async () => {
    const admin = await createUser('ann')
    const member = await createUser('bob')
    const p = await createProject('acme')
    await addMember(p, admin, 'admin')
    await addMember(p, member)
    const patch = { name: 'Renamed' }
    const asMember = { cookie: await sessionCookie(member) }
    expect((await jsonRequest('/api/projects/acme', 'PATCH', patch, asMember)).status).toBe(403)
    const asAdmin = { cookie: await sessionCookie(admin) }
    expect((await jsonRequest('/api/projects/acme', 'PATCH', {}, asAdmin)).status).toBe(422)
    expect((await jsonRequest('/api/projects/acme', 'PATCH', patch, asAdmin)).status).toBe(200)
    const [row] = await db.select().from(project).where(eq(project.slug, 'acme'))
    expect(row?.name).toBe('Renamed')
    const [ev] = await db.select().from(securityEvent).where(eq(securityEvent.type, 'project_updated'))
    expect(ev?.detail).toEqual({ fields: ['name'] })
  })

  it('forgets the default tip when the default branch changes, not otherwise', async () => {
    const admin = await createUser('ann')
    const p = await createProject('acme')
    await addMember(p, admin, 'admin')
    const asAdmin = { cookie: await sessionCookie(admin) }
    const tip = { defaultTip: 'a'.repeat(40), defaultTipAt: new Date() }
    const read = async () => (await db.select().from(project).where(eq(project.id, p.id)))[0]
    await db.update(project).set(tip).where(eq(project.id, p.id))
    expect(
      (await jsonRequest('/api/projects/acme', 'PATCH', { defaultBranch: 'main', name: 'A' }, asAdmin))
        .status,
    ).toBe(200)
    expect((await read())?.defaultTip).toBe(tip.defaultTip)
    expect(
      (await jsonRequest('/api/projects/acme', 'PATCH', { defaultBranch: 'develop' }, asAdmin)).status,
    ).toBe(200)
    expect(await read()).toMatchObject({ defaultBranch: 'develop', defaultTip: null, defaultTipAt: null })
  })
})

describe('GET /api/projects/:slug', () => {
  it('lets a member read the settings and refuses a non-member', async () => {
    const member = await createUser('bob')
    await addMember(await createProject('acme', { name: 'Acme' }), member)
    const res = await jsonRequest('/api/projects/acme', 'GET', undefined, {
      cookie: await sessionCookie(member),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      slug: 'acme',
      name: 'Acme',
      defaultBranch: expect.any(String),
      numbering: expect.any(String),
      createdAt: expect.any(String),
    })
    const outsider = await sessionCookie(await createUser('eve'))
    expect((await jsonRequest('/api/projects/acme', 'GET', undefined, { cookie: outsider })).status).toBe(403)
  })
})

describe('GET /api/me', () => {
  it('requires a session', async () => {
    expect((await request('/api/me')).status).toBe(401)
  })

  it('lists the user and their projects with role', async () => {
    const u = await createUser('alice')
    await addMember(await createProject('b', { name: 'Beta' }), u, 'admin')
    await addMember(await createProject('a', { name: 'Alpha' }), u)
    const res = await request('/api/me', { headers: { cookie: await sessionCookie(u) } })
    expect(await res.json()).toMatchObject({
      user: { id: u.id, githubLogin: 'alice' },
      isHubAdmin: false,
      waiting: false,
      projects: [
        { slug: 'a', name: 'Alpha', role: 'member' },
        { slug: 'b', name: 'Beta', role: 'admin' },
      ],
    })
  })
})
