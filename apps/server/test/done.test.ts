import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { clone, cloneBranch, cloneFeature, featureDone, landedFeature } from '../src/db/schema.ts'
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

interface Docs {
  spec?: string | null
  plan?: string | null
  tasks?: string | null
}

// One clone of `u` reporting `branch` at `tip`, carrying each of `dirs` at the given document oids
// (spec 's1', no plan or tasks by default). Returns the clone id.
async function carry(
  p: TestProject,
  u: TestUser,
  opts: { branch: string; dirs: string[]; tip?: string } & Docs,
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
  })
  for (const dir of opts.dirs)
    await db.insert(cloneFeature).values({
      cloneId: id,
      branch: opts.branch,
      dir,
      lastChangeAt: new Date(),
      authorName: 'Someone',
      authorEmail: `${u.githubLogin}@laptop.test`,
      specOid: opts.spec === undefined ? 's1' : opts.spec,
      planOid: opts.plan ?? null,
      tasksOid: opts.tasks ?? null,
    })
  return id
}

// A later report of the same clone: the copy of `dir` on `branch` now has these document oids.
const reportDocs = (cloneId: string, branch: string, dir: string, docs: Docs) =>
  db
    .update(cloneFeature)
    .set({ specOid: docs.spec, planOid: docs.plan, tasksOid: docs.tasks })
    .where(and(eq(cloneFeature.cloneId, cloneId), eq(cloneFeature.branch, branch), eq(cloneFeature.dir, dir)))

async function setup() {
  const a = await createUser('alice')
  const b = await createUser('bob')
  const p = await createProject('acme')
  for (const u of [a, b]) await addMember(p, u)
  const cookie = await sessionCookie(a)
  return { a, b, p, cookie }
}

const doneUrl = (dir: string) => `/api/projects/acme/features/${dir}/done`
const mark = (cookie: string, dir: string) => jsonRequest(doneUrl(dir), 'POST', undefined, { cookie })
const unmark = (cookie: string, dir: string) => jsonRequest(doneUrl(dir), 'DELETE', undefined, { cookie })
const boardOf = async (cookie: string, slug = 'acme') =>
  (await json(request(`/api/projects/${slug}/board`, { headers: { cookie } }))).board
const inFlightDirs = async (cookie: string, slug = 'acme'): Promise<string[]> => {
  const board = await boardOf(cookie, slug)
  return [...board.inFlight, ...board.stale].map((e: { dir: string }) => e.dir).sort()
}
const feature = (cookie: string, dir: string) =>
  json(request(`/api/projects/acme/features/${dir}`, { headers: { cookie } }))

describe('marking a feature done', () => {
  it('drops the feature from the board; its page is 200 with no versions and the mark (1)', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    await carry(p, b, { branch: '002-other', dirs: ['002-other'], spec: 's9' })
    expect(await inFlightDirs(cookie)).toEqual(['001-a', '002-other'])

    const res = await mark(cookie, '001-a')
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ dir: '001-a', versions: 1 })
    expect(await inFlightDirs(cookie)).toEqual(['002-other'])

    const fres = await request('/api/projects/acme/features/001-a', { headers: { cookie } })
    expect(fres.status).toBe(200)
    const detail = await json(fres)
    expect(detail.entry).toBeNull()
    expect(detail.versions).toEqual([])
    expect(detail.done).toEqual({ by: { githubLogin: 'alice', name: 'alice' }, at: expect.any(Number) })
    expect((await feature(cookie, '002-other')).done).toBeNull()
  })

  it('leaves another feature on the same branch unchanged (2)', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a', '003-c'] })
    const before = (await boardOf(cookie)).inFlight.find((e: { dir: string }) => e.dir === '003-c')
    expect((await mark(cookie, '001-a')).status).toBe(200)
    const board = await boardOf(cookie)
    expect([...board.inFlight, ...board.stale].map((e: { dir: string }) => e.dir)).toEqual(['003-c'])
    expect(board.inFlight.find((e: { dir: string }) => e.dir === '003-c')).toEqual(before)
  })

  it('shows the feature again, built from the copy with new text (3)', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    await mark(cookie, '001-a')
    const idA = await carry(p, a, { branch: 'B2', dirs: ['001-a'] })
    expect(await inFlightDirs(cookie)).toEqual([])
    await reportDocs(idA, 'B2', '001-a', { spec: 's2' })
    expect(await inFlightDirs(cookie)).toEqual(['001-a'])
    const detail = await feature(cookie, '001-a')
    expect(detail.done).toBeNull()
    expect(detail.versions.map((v: { branch: string }) => v.branch)).toEqual(['B2'])
    expect(detail.entry.branches.map((r: { branch: string }) => r.branch)).toEqual(['B2'])
  })

  it('stays done when the branch moves on without changing the documents (4)', async () => {
    const { b, p, cookie } = await setup()
    const id = await carry(p, b, { branch: 'B', dirs: ['001-a'], tip: 'T' })
    await mark(cookie, '001-a')
    await db
      .update(cloneBranch)
      .set({ tip: 'T2', tipAt: new Date() })
      .where(and(eq(cloneBranch.cloneId, id), eq(cloneBranch.name, 'B')))
    expect(await inFlightDirs(cookie)).toEqual([])
    // and a new branch with the marked text unchanged
    await carry(p, b, { branch: 'B3', dirs: ['001-a'] })
    expect(await inFlightDirs(cookie)).toEqual([])
  })

  it('marks every reported version; a copy at a third one brings it back (5)', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, a, { branch: 'B', dirs: ['001-a'], spec: 's1' })
    const idB = await carry(p, b, { branch: 'B2', dirs: ['001-a'], spec: 's2' })
    expect(await json(mark(cookie, '001-a'))).toEqual({ dir: '001-a', versions: 2 })
    expect(await inFlightDirs(cookie)).toEqual([])
    // text going back to a marked version stays done
    await reportDocs(idB, 'B2', '001-a', { spec: 's1' })
    expect(await inFlightDirs(cookie)).toEqual([])
    await reportDocs(idB, 'B2', '001-a', { spec: 's3' })
    expect(await inFlightDirs(cookie)).toEqual(['001-a'])
    const board = await boardOf(cookie)
    expect(board.inFlight[0].owner).toMatchObject({ kind: 'member', userId: b.id })
  })

  it('counts a copy that loses its plan as new text (6)', async () => {
    const { b, p, cookie } = await setup()
    const id = await carry(p, b, { branch: 'B', dirs: ['001-a'], spec: 's1', plan: 'p1' })
    await mark(cookie, '001-a')
    expect(await inFlightDirs(cookie)).toEqual([])
    await reportDocs(id, 'B', '001-a', { spec: 's1', plan: null })
    expect(await inFlightDirs(cookie)).toEqual(['001-a'])
  })

  it('keeps a landed feature in Finished and the landed list (8)', async () => {
    const { b, p, cookie } = await setup()
    await db.insert(landedFeature).values({
      projectId: p.id,
      dir: '001-a',
      firstSeenAt: new Date(),
      baseline: false,
    })
    await carry(p, b, { branch: 'leftover', dirs: ['001-a'] })
    expect(await inFlightDirs(cookie)).toEqual(['001-a'])
    expect((await mark(cookie, '001-a')).status).toBe(200)
    expect(await inFlightDirs(cookie)).toEqual([])
    const board = await boardOf(cookie)
    expect(board.landedDirs).toEqual(['001-a'])
    expect(board.recentlyLanded.map((l: { dir: string }) => l.dir)).toEqual(['001-a'])
    const { finished } = await json(request('/api/projects/acme/finished', { headers: { cookie } }))
    expect(finished.map((f: { dir: string }) => f.dir)).toEqual(['001-a'])
    const detail = await feature(cookie, '001-a')
    expect(detail.landed.dir).toBe('001-a')
    expect(detail.done).not.toBeNull()
  })
})

describe('undo and access', () => {
  it('shows the feature again after DELETE, 204 also with no mark (7)', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    await mark(cookie, '001-a')
    const res = await unmark(cookie, '001-a')
    expect(res.status).toBe(204)
    expect(await inFlightDirs(cookie)).toEqual(['001-a'])
    expect((await feature(cookie, '001-a')).done).toBeNull()
    expect(await db.select().from(featureDone)).toEqual([])
    expect((await unmark(cookie, '001-a')).status).toBe(204)
  })

  it('refuses non-members on both routes', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    const outsider = await sessionCookie(await createUser('mallory'))
    expect((await mark(outsider, '001-a')).status).toBe(403)
    expect(await db.select().from(featureDone)).toEqual([])
    await mark(cookie, '001-a')
    expect((await unmark(outsider, '001-a')).status).toBe(403)
    expect(await db.select().from(featureDone)).toHaveLength(1)
  })

  it('answers 404 for a folder no member clone reports', async () => {
    const { p, cookie } = await setup()
    // reported only by someone who is no longer a member: not the board's population
    await carry(p, await createUser('gone'), { branch: 'B', dirs: ['001-a'] })
    const res = await mark(cookie, '001-a')
    expect(res.status).toBe(404)
    expect(await json(res)).toEqual({ error: 'no such feature in flight' })
    expect((await mark(cookie, '009-nope')).status).toBe(404)
    expect(await db.select().from(featureDone)).toEqual([])
  })

  it('keeps one row per version when a second member marks the same feature', async () => {
    const { a, b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    expect((await mark(cookie, '001-a')).status).toBe(200)
    expect((await mark(await sessionCookie(b), '001-a')).status).toBe(200)
    const rows = await db.select().from(featureDone)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ dir: '001-a', docsKey: 's1:-:-', doneBy: a.id })
  })

  it('a mark in one project leaves the same folder and text in another project counted', async () => {
    const { b, p, cookie } = await setup()
    await carry(p, b, { branch: 'B', dirs: ['001-a'] })
    const other = await createProject('other')
    const carol = await createUser('carol')
    await addMember(other, carol)
    await carry(other, carol, { branch: 'B', dirs: ['001-a'] })
    expect((await mark(cookie, '001-a')).status).toBe(200)
    expect(await inFlightDirs(cookie)).toEqual([])
    expect(await inFlightDirs(await sessionCookie(carol), 'other')).toEqual(['001-a'])
  })
})
