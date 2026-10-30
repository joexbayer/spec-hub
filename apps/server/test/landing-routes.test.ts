import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db/client.ts'
import { landPlace, securityEvent } from '../src/db/schema.ts'
import { poll } from '../src/services/landing.ts'
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

const caller = (p: TestProject, u: TestUser) => ({ project: p, userId: u.id })
const cookieHeader = async (u: TestUser) => ({ Cookie: await sessionCookie(u) })

// ann holds, bob and cat wait, in that order
async function queue() {
  const p = await createProject('acme')
  const [ann, bob, cat] = await Promise.all([createUser('ann'), createUser('bob'), createUser('cat')])
  for (const u of [ann, bob, cat]) {
    await addMember(p, u)
    await poll(db, caller(p, u))
  }
  return { p, ann, bob, cat }
}

const get = async (u: TestUser) =>
  json(jsonRequest('/api/projects/acme/landing', 'GET', undefined, await cookieHeader(u)))
const end = async (u: TestUser, id: number | string, slug = 'acme') =>
  jsonRequest(`/api/projects/${slug}/landing/${id}/end`, 'POST', undefined, await cookieHeader(u))

describe('landing routes', () => {
  it('shows the holder and the waiting order with positions, estimates and mine', async () => {
    const { p, ann, bob, cat } = await queue()
    const v = await get(bob)
    expect(v.defaultBranch).toBe(p.defaultBranch)
    expect(v.holder.login).toBe('ann')
    expect(v.waiting.map((w: { login: string }) => w.login)).toEqual(['bob', 'cat'])
    expect(v.waiting.map((w: { position: number }) => w.position)).toEqual([1, 2])
    expect(v.waiting.map((w: { mine: boolean }) => w.mine)).toEqual([true, false])
    expect(v.waiting[0].etaMinutes).toBeLessThan(v.waiting[1].etaMinutes)
    expect(v.minutesPerTurn).toBeGreaterThan(0)
    expect(v.history).toEqual([])
    expect((await get(ann)).waiting.map((w: { mine: boolean }) => w.mine)).toEqual([false, false])
    expect(cat.id).toBeTruthy()
  })

  it('ending your own holding place releases it and hands the lock on', async () => {
    const { ann } = await queue()
    const v = await get(ann)
    const res = await end(ann, v.holder.id)
    expect(res.status).toBe(200)
    const after = await json(res)
    expect(after.holder.login).toBe('bob')
    expect(after.history[0]).toMatchObject({ login: 'ann', outcome: 'released', endedBy: null })
    expect((await get(ann)).holder.login).toBe('bob')
  })

  it('ending your own waiting place leaves the queue', async () => {
    const { cat } = await queue()
    const v = await get(cat)
    const after = await json(end(cat, v.waiting[1].id))
    expect(after.waiting.map((w: { login: string }) => w.login)).toEqual(['bob'])
    expect(after.history[0]).toMatchObject({ login: 'cat', outcome: 'left', endedBy: null })
  })

  it("removing someone else's place records who and audits it", async () => {
    const { p, ann, bob } = await queue()
    const v = await get(bob)
    const res = await end(bob, v.holder.id)
    expect(res.status).toBe(200)
    const after = await json(res)
    expect(after.history[0]).toMatchObject({ login: 'ann', outcome: 'removed', endedBy: 'bob' })
    expect(after.holder.login).toBe('bob')
    const events = await db.select().from(securityEvent).where(eq(securityEvent.type, 'land_removed'))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ actorUserId: bob.id, projectId: p.id })
    expect(events[0]?.detail).toEqual({ placeId: v.holder.id, owner: ann.id })
  })

  it('does not audit ending your own place', async () => {
    const { ann } = await queue()
    await end(ann, (await get(ann)).holder.id)
    expect(await db.select().from(securityEvent).where(eq(securityEvent.type, 'land_removed'))).toEqual([])
  })

  it('answers 404 for a place of another project and changes nothing', async () => {
    const { ann } = await queue()
    const other = await createProject('other')
    const dan = await createUser('dan')
    await addMember(other, dan)
    await poll(db, caller(other, dan))
    const [dansPlace] = await db.select().from(landPlace).where(eq(landPlace.userId, dan.id))
    const res = await end(ann, dansPlace?.id ?? 0)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'no such place' })
    const [still] = await db.select().from(landPlace).where(eq(landPlace.userId, dan.id))
    expect(still?.state).toBe('holding')
  })

  it('answers 404 for an already ended place', async () => {
    const { ann, bob } = await queue()
    const id = (await get(ann)).holder.id
    expect((await end(ann, id)).status).toBe(200)
    expect((await end(bob, id)).status).toBe(404)
    const [row] = await db.select().from(landPlace).where(eq(landPlace.id, id))
    expect(row?.outcome).toBe('released')
  })

  it('refuses non-members and anonymous callers', async () => {
    const { ann } = await queue()
    const eve = await createUser('eve')
    const id = (await get(ann)).holder.id
    expect((await end(eve, id)).status).toBe(403)
    expect(
      (await jsonRequest('/api/projects/acme/landing', 'GET', undefined, await cookieHeader(eve))).status,
    ).toBe(403)
    expect((await request('/api/projects/acme/landing')).status).toBe(401)
    expect((await jsonRequest(`/api/projects/acme/landing/${id}/end`, 'POST')).status).toBe(401)
  })

  it('refuses a cross-origin end', async () => {
    const { ann } = await queue()
    const res = await request(`/api/projects/acme/landing/${(await get(ann)).holder.id}/end`, {
      method: 'POST',
      headers: { Origin: 'http://evil.test', ...(await cookieHeader(ann)) },
    })
    expect(res.status).toBe(403)
  })
})
