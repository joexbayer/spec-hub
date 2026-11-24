import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { branchHide, clone, cloneBranch, cloneFeature } from '../src/db/schema.ts'
import {
  addMember,
  createProject,
  createUser,
  jsonRequest,
  request,
  sessionCookie,
  type TestProject,
  type TestUser,
  truncateAll,
} from './helpers.ts'

beforeEach(truncateAll)

// biome-ignore lint/suspicious/noExplicitAny: test reads loosely shaped JSON
const json = async (res: Response | Promise<Response>): Promise<any> => (await res).json()

// One clone of `u` reporting `branch` at `tip`, carrying each of `dirs`. Returns the clone id.
async function carry(
  p: TestProject,
  u: TestUser,
  opts: { branch: string; dirs: string[]; tip?: string; remote?: boolean },
): Promise<string> {
  const id = crypto.randomUUID()
  await db.insert(clone).values({
    id,
    projectId: p.id,
    userId: u.id,
    commitEmail: `${u.githubLogin}@laptop.test`,
    generatedAt: Date.now(),
    reportedAt: new Date(),
  })
  await db.insert(cloneBranch).values({
    cloneId: id,
    name: opts.branch,
    tip: opts.tip ?? 'abc',
    tipAt: new Date(),
    pushed: true,
    remote: opts.remote ?? false,
  })
  for (const dir of opts.dirs)
    await db.insert(cloneFeature).values({
      cloneId: id,
      branch: opts.branch,
      dir,
      lastChangeAt: new Date(),
      authorName: 'Someone',
      authorEmail: `${u.githubLogin}@laptop.test`,
    })
  return id
}

const moveTip = (cloneId: string, branch: string, tip: string) =>
  db
    .update(cloneBranch)
    .set({ tip })
    .where(and(eq(cloneBranch.cloneId, cloneId), eq(cloneBranch.name, branch)))

async function setup() {
  const a = await createUser('alice')
  const b = await createUser('bob')
  const p = await createProject('acme')
  for (const u of [a, b]) await addMember(p, u)
  const cookie = await sessionCookie(a)
  return { a, b, p, cookie }
}

const hide = (cookie: string, branch: string) =>
  jsonRequest('/api/projects/acme/hidden-branches', 'POST', { branch }, { cookie })
const show = (cookie: string, branch: string) =>
  jsonRequest(
    `/api/projects/acme/hidden-branches?branch=${encodeURIComponent(branch)}`,
    'DELETE',
    undefined,
    {
      cookie,
    },
  )
const inFlightDirs = async (cookie: string): Promise<string[]> => {
  const { board } = await json(request('/api/projects/acme/board', { headers: { cookie } }))
  return [...board.inFlight, ...board.stale].map((e: { dir: string }) => e.dir).sort()
}
const feature = (cookie: string, dir: string) =>
  json(request(`/api/projects/acme/features/${dir}`, { headers: { cookie } }))

describe('hiding a branch', () => {
  it('drops a feature carried only by the hidden branch and lists it under hidden', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    await carry(p, a, { branch: '002-new', dirs: ['002-new'] })
    expect(await inFlightDirs(cookie)).toEqual(['001-old', '002-new'])

    const res = await hide(cookie, '001-old')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ branch: '001-old', tips: 1 })
    expect(await inFlightDirs(cookie)).toEqual(['002-new'])

    const fres = await request('/api/projects/acme/features/001-old', { headers: { cookie } })
    expect(fres.status).toBe(200)
    const detail = await json(fres)
    expect(detail.entry).toBeNull()
    expect(detail.versions).toEqual([])
    expect(detail.hidden).toEqual([
      { branch: '001-old', hiddenBy: { githubLogin: 'alice', name: 'alice' }, hiddenAt: expect.any(Number) },
    ])
    expect((await feature(cookie, '002-new')).hidden).toEqual([])
  })

  it('hides every feature the branch carries', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'combo', dirs: ['001-one', '002-two'] })
    expect(await inFlightDirs(cookie)).toEqual(['001-one', '002-two'])
    expect((await hide(cookie, 'combo')).status).toBe(200)
    expect(await inFlightDirs(cookie)).toEqual([])
    expect((await feature(cookie, '002-two')).hidden.map((h: { branch: string }) => h.branch)).toEqual([
      'combo',
    ])
  })

  it('counts the branch again once it is reported at a new tip', async () => {
    const { b, p, cookie } = await setup()
    const id = await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    await hide(cookie, '001-old')
    expect(await inFlightDirs(cookie)).toEqual([])
    await moveTip(id, '001-old', 'T2')
    expect(await inFlightDirs(cookie)).toEqual(['001-old'])
    const detail = await feature(cookie, '001-old')
    expect(detail.hidden).toEqual([])
    expect(detail.versions.map((v: { branch: string }) => v.branch)).toEqual(['001-old'])
  })

  it('hides every reported tip; a copy that moves on counts by itself', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, a, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    const idB = await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T2' })
    expect(await json(hide(cookie, '001-old'))).toEqual({ branch: '001-old', tips: 2 })
    expect(await inFlightDirs(cookie)).toEqual([])

    await moveTip(idB, '001-old', 'T3')
    expect(await inFlightDirs(cookie)).toEqual(['001-old'])
    const { board } = await json(request('/api/projects/acme/board', { headers: { cookie } }))
    expect(board.inFlight[0].owner).toMatchObject({ kind: 'member', userId: b.id })
    // a counted copy of the name means the branch is not listed as hidden
    expect((await feature(cookie, '001-old')).hidden).toEqual([])
  })

  it('hides the branch again when it moves back to a hidden tip', async () => {
    const { b, p, cookie } = await setup()
    const id = await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    await hide(cookie, '001-old')
    await moveTip(id, '001-old', 'T2')
    expect(await inFlightDirs(cookie)).toEqual(['001-old'])
    await moveTip(id, '001-old', 'T')
    expect(await inFlightDirs(cookie)).toEqual([])
  })

  it('hides a remote copy and a local copy at the same tip with one hide', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, a, { branch: '001-old', dirs: ['001-old'], tip: 'T', remote: true })
    await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    expect(await json(hide(cookie, '001-old'))).toEqual({ branch: '001-old', tips: 1 })
    expect(await inFlightDirs(cookie)).toEqual([])
    expect((await feature(cookie, '001-old')).hidden).toHaveLength(1)
  })
})

describe('showing a branch again and access', () => {
  it('shows the branch again after DELETE', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: '001-old', dirs: ['001-old'] })
    await hide(cookie, '001-old')
    const res = await show(cookie, '001-old')
    expect(res.status).toBe(204)
    expect(await inFlightDirs(cookie)).toEqual(['001-old'])
    expect((await feature(cookie, '001-old')).hidden).toEqual([])
    // nothing to show is still 204
    expect((await show(cookie, '001-old')).status).toBe(204)
  })

  it('refuses non-members on both routes', async () => {
    const { b, p } = await setup()
    await carry(p, b, { branch: '001-old', dirs: ['001-old'] })
    const outsider = await sessionCookie(await createUser('mallory'))
    expect((await hide(outsider, '001-old')).status).toBe(403)
    expect((await show(outsider, '001-old')).status).toBe(403)
    expect(await db.select().from(branchHide)).toEqual([])
  })

  it('answers 404 for a branch no clone reports', async () => {
    const { cookie } = await setup()
    const res = await hide(cookie, 'nope')
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: 'no such branch' })
  })

  it('rejects control characters and empty names', async () => {
    const { cookie } = await setup()
    expect((await hide(cookie, 'bad\nname')).status).toBe(422)
    expect((await hide(cookie, '')).status).toBe(422)
    expect((await show(cookie, '')).status).toBe(422)
  })

  it('keeps one row per tip when a second member hides the same branch', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, b, { branch: '001-old', dirs: ['001-old'], tip: 'T' })
    expect((await hide(cookie, '001-old')).status).toBe(200)
    expect((await hide(await sessionCookie(b), '001-old')).status).toBe(200)
    const rows = await db.select().from(branchHide)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hiddenBy).toBe(a.id)
  })
})
