import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import {
  clone,
  cloneBranch,
  cloneFeature,
  document,
  landedFeature,
  membership,
  project,
} from '../src/db/schema.ts'
import { loadBoard, loadFeature } from '../src/services/board-query.ts'
import {
  addMember,
  createProject,
  createUser,
  request,
  sessionCookie,
  type TestProject,
  type TestUser,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)

// biome-ignore lint/suspicious/noExplicitAny: test reads loosely shaped JSON
const json = async (res: Response | Promise<Response>): Promise<any> => (await res).json()

const HOUR = 3_600_000

async function doc(
  p: TestProject,
  oid: string,
  content: string,
  facts: Partial<typeof document.$inferInsert> = {},
) {
  await db.insert(document).values({ projectId: p.id, oid, size: content.length, content, ...facts })
}

async function carry(
  p: TestProject,
  u: TestUser,
  opts: {
    email: string
    reportedAt: Date
    branch: string
    dir: string
    specOid?: string
    tasksOid?: string
    authorEmail?: string
    lastChangeAt?: Date
    tipAt?: Date
  },
) {
  const id = crypto.randomUUID()
  await db.insert(clone).values({
    id,
    projectId: p.id,
    userId: u.id,
    commitEmail: opts.email,
    generatedAt: Date.now(),
    reportedAt: opts.reportedAt,
  })
  await db
    .insert(cloneBranch)
    .values({ cloneId: id, name: opts.branch, tip: 'abc', tipAt: opts.tipAt ?? new Date(), pushed: true })
  await db.insert(cloneFeature).values({
    cloneId: id,
    branch: opts.branch,
    dir: opts.dir,
    lastChangeAt: opts.lastChangeAt ?? new Date(),
    authorName: 'Someone',
    authorEmail: opts.authorEmail ?? opts.email,
    specOid: opts.specOid ?? null,
    tasksOid: opts.tasksOid ?? null,
  })
}

async function setup() {
  const a = await createUser('alice')
  const b = await createUser('bob')
  const c = await createUser('carol')
  const p = await createProject('acme')
  for (const u of [a, b, c]) await addMember(p, u)
  const reportA = new Date(Date.now() - HOUR)
  const reportB = new Date(Date.now() - 2 * HOUR)
  await doc(p, 'spec-a', '# Alpha\n**Owner**: alice\n', { title: 'Alpha', ownerHandle: 'alice' })
  await doc(p, 'spec-b', '# Beta spec', { title: 'Beta' })
  await doc(p, 'tasks-b', '- [x] T1\n- [ ] T2', { tasksDone: 1, tasksTotal: 2 })
  await carry(p, a, {
    email: 'a@laptop.test',
    reportedAt: reportA,
    branch: '001-alpha',
    dir: '001-alpha',
    specOid: 'spec-a',
  })
  await carry(p, b, {
    email: 'bob.git@laptop.test',
    reportedAt: reportB,
    branch: '002-beta',
    dir: '002-beta',
    specOid: 'spec-b',
    tasksOid: 'tasks-b',
  })
  const cookie = { cookie: await sessionCookie(c) }
  return { a, b, c, p, cookie, reportA, reportB }
}

describe('GET /api/projects/:slug/board', () => {
  it('shows each member feature with owner, phase and last report time', async () => {
    const { a, b, cookie, reportA, reportB } = await setup()
    const res = await request('/api/projects/acme/board', { headers: cookie })
    expect(res.status).toBe(200)
    const { board, lastReportAt, defaultBranch } = await json(res)
    expect(defaultBranch).toBe('main')
    expect(board.inFlight.map((e: { dir: string }) => e.dir).sort()).toEqual(['001-alpha', '002-beta'])
    const alpha = board.inFlight.find((e: { dir: string }) => e.dir === '001-alpha')
    const beta = board.inFlight.find((e: { dir: string }) => e.dir === '002-beta')
    expect(alpha.owner).toMatchObject({ kind: 'member', userId: a.id })
    expect(beta.owner).toMatchObject({ kind: 'member', userId: b.id })
    expect(alpha.phase).toEqual({ kind: 'specify' })
    expect(beta.phase).toEqual({ kind: 'implement', done: 1, total: 2 })
    expect(lastReportAt).toEqual({ [a.id]: reportA.getTime(), [b.id]: reportB.getTime() })
  })

  it('names members an admin added who have not signed in yet', async () => {
    const { p, cookie } = await setup()
    await db
      .insert(membership)
      .values({ projectId: p.id, githubId: '9001', assignedLogin: 'later', role: 'member' })
    const { board, pending } = await json(request('/api/projects/acme/board', { headers: cookie }))
    expect(pending).toEqual(['later'])
    expect(board.members.map((m: { githubLogin: string }) => m.githubLogin)).not.toContain('later')
  })

  it('rejects non-members, signed-out callers and unknown projects', async () => {
    await setup()
    const outsider = { cookie: await sessionCookie(await createUser('mallory')) }
    expect((await request('/api/projects/acme/board', { headers: outsider })).status).toBe(403)
    expect((await request('/api/projects/acme/board')).status).toBe(401)
    expect((await request('/api/projects/nope/board', { headers: outsider })).status).toBe(404)
  })

  it('drops a removed member features and report time', async () => {
    const { p, b, cookie } = await setup()
    await db.delete(membership).where(eq(membership.userId, b.id))
    await db.delete(clone).where(eq(clone.userId, b.id))
    const { board, lastReportAt } = await json(request('/api/projects/acme/board', { headers: cookie }))
    expect(board.inFlight.map((e: { dir: string }) => e.dir)).toEqual(['001-alpha'])
    expect(lastReportAt[b.id]).toBeUndefined()
    expect(p.slug).toBe('acme')
  })

  it('lists only non-baseline landed features', async () => {
    const { p, cookie } = await setup()
    await db.insert(landedFeature).values([
      { projectId: p.id, dir: '000-old', firstSeenAt: new Date(), baseline: true },
      { projectId: p.id, dir: '003-new', firstSeenAt: new Date(), baseline: false },
    ])
    const { board } = await json(request('/api/projects/acme/board', { headers: cookie }))
    expect(board.recentlyLanded.map((l: { dir: string }) => l.dir)).toEqual(['003-new'])
  })
})

describe('GET /api/projects/:slug/features/:dir', () => {
  it('returns the shown spec content and facts', async () => {
    const { cookie } = await setup()
    const res = await request('/api/projects/acme/features/001-alpha', { headers: cookie })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.shown.docs.spec.content).toBe('# Alpha\n**Owner**: alice\n')
    expect(body.shown.docs.spec.facts.ownerHandle).toBe('alice')
    expect(body.shown.docs.plan).toBeNull()
  })

  it('shows extra documents of the branch version and of the default branch, empty when none', async () => {
    const { p, cookie } = await setup()
    await doc(p, 'preview-a', '# Preview A')
    await doc(p, 'preview-main', '# Preview main')
    const extraA = [
      { name: 'preview.md', oid: 'preview-a', size: 11 },
      { name: 'gone.md', oid: 'no-such-oid', size: 3 },
    ]
    await db.update(cloneFeature).set({ extraDocs: extraA }).where(eq(cloneFeature.dir, '001-alpha'))
    await db.insert(landedFeature).values({
      projectId: p.id,
      dir: '001-alpha',
      firstSeenAt: new Date(),
      baseline: false,
      addedAt: new Date(),
      lastChangeAt: new Date(),
      specOid: 'spec-a',
      extraDocs: [{ name: 'preview.md', oid: 'preview-main', size: 14 }],
    })
    const base = '/api/projects/acme/features/001-alpha'
    const branch = await json(request(base, { headers: cookie }))
    expect(branch.shown.extra).toMatchObject([{ name: 'preview.md', doc: { content: '# Preview A' } }])
    const main = await json(request(`${base}?branch=main`, { headers: cookie }))
    expect(main.shown.extra).toMatchObject([{ name: 'preview.md', doc: { content: '# Preview main' } }])
    const none = await json(request('/api/projects/acme/features/002-beta', { headers: cookie }))
    expect(none.shown.extra).toEqual([])
  })

  it('selects the requested branch when two carry the same dir', async () => {
    const { p, a, b, cookie } = await setup()
    await doc(p, 'spec-b2', '# Beta v2', { title: 'Beta v2' })
    await carry(p, a, {
      email: 'a@laptop.test',
      reportedAt: new Date(),
      branch: 'beta-rework',
      dir: '002-beta',
      specOid: 'spec-b2',
      lastChangeAt: new Date(Date.now() - HOUR),
    })
    const base = '/api/projects/acme/features/002-beta'
    const dflt = await json(request(base, { headers: cookie }))
    expect(dflt.versions).toHaveLength(2)
    expect(dflt.shown.branch).toBe('002-beta')
    const other = await json(request(`${base}?branch=beta-rework`, { headers: cookie }))
    expect(other.shown.branch).toBe('beta-rework')
    expect(other.shown.docs.spec.content).toBe('# Beta v2')
    expect(b.id).not.toBe(a.id)
  })

  it('shows the same version as the board when two versions tie on last change', async () => {
    const { p, a, b, cookie } = await setup()
    const at = new Date(Date.now() - HOUR)
    await doc(p, 'spec-z', '# Zeta', { title: 'Zeta' })
    await doc(p, 'spec-y', '# Alpha branch', { title: 'Alpha branch' })
    await carry(p, b, {
      email: 'b@x.test',
      reportedAt: at,
      branch: 'zeta',
      dir: '009-tie',
      specOid: 'spec-z',
      lastChangeAt: at,
    })
    await carry(p, a, {
      email: 'a@x.test',
      reportedAt: at,
      branch: 'alpha',
      dir: '009-tie',
      specOid: 'spec-y',
      lastChangeAt: at,
    })
    const { board } = await json(request('/api/projects/acme/board', { headers: cookie }))
    expect(board.inFlight.find((e: { dir: string }) => e.dir === '009-tie').title).toBe('Alpha branch')
    const detail = await json(request('/api/projects/acme/features/009-tie', { headers: cookie }))
    expect(detail.shown.branch).toBe('alpha')
    expect(detail.versions.map((v: { branch: string }) => v.branch)).toEqual(['alpha', 'zeta'])
  })

  it('keeps a feature in flight while its own branch gets commits, on the board and its page', async () => {
    const a = await createUser('alice')
    const p = await createProject('acme')
    await addMember(p, a)
    const old = new Date(Date.now() - 20 * 24 * HOUR)
    await carry(p, a, {
      email: 'a@laptop.test',
      reportedAt: new Date(),
      branch: '010-eval-gate',
      dir: '010-eval-gate',
      lastChangeAt: old,
      tipAt: new Date(Date.now() - HOUR),
    })
    const board = await loadBoard(db, p.id)
    expect(board.inFlight.map((e) => e.dir)).toEqual(['010-eval-gate'])
    const detail = await loadFeature(db, p.id, '010-eval-gate')
    expect(detail?.versions[0]?.lastChangeAt).toBe(board.inFlight[0]?.lastChangeAt)
  })

  it('404s for an unknown dir and 422s for an invalid one', async () => {
    const { cookie } = await setup()
    const res = await request('/api/projects/acme/features/999-nope', { headers: cookie })
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: 'no such feature' })
    const bad = await request('/api/projects/acme/features/x%01y', { headers: cookie })
    expect(bad.status).toBe(422)
  })
})

describe('finished features', () => {
  const day = 24 * HOUR
  const facts = (at: Date, specOid: string | null) => ({
    addedAt: at,
    lastChangeAt: at,
    authorName: 'Dev',
    authorEmail: 'dev@x.test',
    specOid,
  })

  async function seedLanded(p: TestProject) {
    await doc(p, 'spec-old', '# Old one\n**Owner**: bob\n', { title: 'Old one', ownerHandle: 'bob' })
    await doc(p, 'spec-new', '# New one', { title: 'New one' })
    const t = Date.now()
    await db.insert(landedFeature).values([
      // baseline: landedAt is addedAt (5 days ago), not firstSeenAt (today)
      {
        projectId: p.id,
        dir: '000-old',
        firstSeenAt: new Date(t),
        baseline: true,
        ...facts(new Date(t - 5 * day), 'spec-old'),
        specSize: 20,
      },
      // non-baseline: landedAt is firstSeenAt (2 days ago)
      {
        projectId: p.id,
        dir: '003-new',
        firstSeenAt: new Date(t - 2 * day),
        baseline: false,
        ...facts(new Date(t - 9 * day), 'spec-new'),
        authorEmail: 'bob.git@laptop.test',
      },
      { projectId: p.id, dir: '004-bare', firstSeenAt: new Date(t - 3 * day), baseline: false },
      // also carried on a branch: in flight
      {
        projectId: p.id,
        dir: '001-alpha',
        firstSeenAt: new Date(t - 4 * day),
        baseline: false,
        ...facts(new Date(t - 4 * day), 'spec-a'),
      },
    ])
  }

  it('lists newest landed first with owner, reported and in-flight', async () => {
    const { p, b, cookie } = await setup()
    await seedLanded(p)
    const res = await request('/api/projects/acme/finished', { headers: cookie })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.defaultBranch).toBe('main')
    expect(body.finished.map((f: { dir: string }) => f.dir)).toEqual([
      '003-new',
      '004-bare',
      '001-alpha',
      '000-old',
    ])
    const by = (d: string) => body.finished.find((f: { dir: string }) => f.dir === d)
    expect(by('000-old').owner).toMatchObject({ kind: 'member', userId: b.id })
    expect(by('003-new').owner).toMatchObject({ kind: 'member', userId: b.id })
    expect(by('003-new').title).toBe('New one')
    expect(by('004-bare').reported).toBe(false)
    expect(by('003-new').reported).toBe(true)
    expect(by('001-alpha').inFlight).toBe(true)
    expect(by('003-new').inFlight).toBe(false)
    expect(body.members).toBeUndefined()
    expect(body.finishedTipAt).toBeNull()
    const tip = new Date(Date.now() - day)
    await db
      .update(project)
      .set({ finishedTip: 'a'.repeat(40), finishedTipAt: tip })
      .where(eq(project.id, p.id))
    expect((await json(request('/api/projects/acme/finished', { headers: cookie }))).finishedTipAt).toBe(
      tip.getTime(),
    )
  })

  it('rejects signed-out callers, non-members and unknown projects', async () => {
    await setup()
    const outsider = { cookie: await sessionCookie(await createUser('mallory')) }
    expect((await request('/api/projects/acme/finished')).status).toBe(401)
    expect((await request('/api/projects/acme/finished', { headers: outsider })).status).toBe(403)
    expect((await request('/api/projects/nope/finished', { headers: outsider })).status).toBe(404)
  })

  it("shows main's documents for a finished-only feature", async () => {
    const { p, cookie } = await setup()
    await seedLanded(p)
    const body = await json(request('/api/projects/acme/features/003-new', { headers: cookie }))
    expect(body.versions).toEqual([])
    expect(body.shown.branch).toBe('main')
    expect(body.shown.docs.spec.content).toBe('# New one')
    expect(body.landed.branch).toBe('main')
    expect(body.landed.finished).toMatchObject({ dir: '003-new', reported: true })
  })

  it('shows the branch by default and main on request when both exist', async () => {
    const { p, cookie } = await setup()
    await doc(p, 'spec-a-main', '# Alpha on main', { title: 'Alpha on main' })
    await db.insert(landedFeature).values({
      projectId: p.id,
      dir: '001-alpha',
      firstSeenAt: new Date(),
      baseline: false,
      ...facts(new Date(), 'spec-a-main'),
    })
    const base = '/api/projects/acme/features/001-alpha'
    const dflt = await json(request(base, { headers: cookie }))
    expect(dflt.shown.branch).toBe('001-alpha')
    expect(dflt.shown.docs.spec.content).toBe('# Alpha\n**Owner**: alice\n')
    expect(dflt.versions).toHaveLength(1)
    const main = await json(request(`${base}?branch=main`, { headers: cookie }))
    expect(main.shown.branch).toBe('main')
    expect(main.shown.docs.spec.content).toBe('# Alpha on main')
  })
})

describe('owner by email (spoofing)', () => {
  it("does not let a claimed commit email take another member's features", async () => {
    const eve = await createUser('eve')
    const carol = await createUser('carol')
    const dave = await createUser('dave')
    const p = await createProject('acme')
    for (const u of [eve, dave, carol]) await addMember(p, u)
    const now = new Date()
    // Eve's and Dave's clones both claim Carol's account email; Eve and Dave also share another one
    await carry(p, eve, { email: carol.email, reportedAt: now, branch: 'e1', dir: '010-e' })
    await carry(p, eve, { email: 'shared@x.test', reportedAt: now, branch: 'e2', dir: '011-e' })
    await carry(p, dave, { email: 'shared@x.test', reportedAt: now, branch: 'd1', dir: '012-d' })
    await carry(p, dave, { email: 'dave.git@x.test', reportedAt: now, branch: 'd2', dir: '013-d' })
    // features first committed by Carol (her account email), by the shared email and by Dave's own
    await carry(p, eve, {
      email: carol.email,
      reportedAt: now,
      branch: 'c1',
      dir: '020-c',
      authorEmail: carol.email,
    })
    await carry(p, eve, {
      email: carol.email,
      reportedAt: now,
      branch: 'c2',
      dir: '021-s',
      authorEmail: 'shared@x.test',
    })
    await carry(p, eve, {
      email: carol.email,
      reportedAt: now,
      branch: 'c3',
      dir: '022-d',
      authorEmail: 'dave.git@x.test',
    })
    const cookie = { cookie: await sessionCookie(carol) }
    const { board } = await json(request('/api/projects/acme/board', { headers: cookie }))
    const owner = (dir: string) => board.inFlight.find((e: { dir: string }) => e.dir === dir).owner
    expect(owner('020-c')).toMatchObject({ kind: 'member', userId: carol.id })
    expect(owner('021-s')).toEqual({ kind: 'git-name', name: 'Someone' })
    expect(owner('022-d')).toMatchObject({ kind: 'member', userId: dave.id })
  })
})
