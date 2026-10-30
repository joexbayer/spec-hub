import { and, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db/client.ts'
import { landPlace, membership } from '../src/db/schema.ts'
import { ask, endById, type LandCaller, poll, unlock } from '../src/services/landing.ts'
import { addMember, createProject, createUser, truncateAll } from './helpers.ts'

async function setup(logins: string[]) {
  const p = await createProject('acme')
  const people: Record<string, LandCaller> = {}
  for (const login of logins) {
    const u = await createUser(login)
    await addMember(p, u)
    people[login] = { project: { id: p.id, defaultBranch: p.defaultBranch }, userId: u.id }
  }
  return people
}

const outcomes = async (c: LandCaller) =>
  (await db.select().from(landPlace).where(eq(landPlace.userId, c.userId)).orderBy(landPlace.id)).map(
    (r) => r.outcome,
  )

beforeEach(truncateAll)
afterEach(() => vi.useRealTimers())

describe('landing queue service', () => {
  it('grants a free queue at once and queues the next member with an estimate', async () => {
    const { alice, bob } = await setup(['alice', 'bob'])
    expect(await poll(db, alice!)).toMatchObject({ state: 'holding' })
    const s = await poll(db, bob!)
    expect(s).toMatchObject({ state: 'waiting', position: 1, etaMinutes: 10 })
    expect(s.holder?.login).toBe('alice')
  })

  it('keeps a repeated poll on one live place', async () => {
    const { alice } = await setup(['alice'])
    await poll(db, alice!)
    expect(await poll(db, alice!)).toMatchObject({ state: 'holding' })
    const live = await db.select().from(landPlace).where(eq(landPlace.userId, alice!.userId))
    expect(live).toHaveLength(1)
  })

  it('hands over on unlock and reports how each place ended', async () => {
    const { alice, bob } = await setup(['alice', 'bob'])
    await poll(db, alice!)
    await poll(db, bob!)
    expect(await unlock(db, alice!, false)).toEqual({ ended: 'released' })
    expect(await poll(db, bob!)).toMatchObject({ state: 'holding' })
    expect(await unlock(db, bob!, true)).toEqual({ ended: 'landed' })
  })

  it('records leaving while waiting, and unlock with no place ends nothing', async () => {
    const { alice, bob, carol } = await setup(['alice', 'bob', 'carol'])
    await poll(db, alice!)
    await poll(db, bob!)
    expect(await unlock(db, bob!, false)).toEqual({ ended: 'left' })
    expect(await unlock(db, carol!, false)).toEqual({ ended: null })
  })

  it('grants exactly one holder under concurrent polls', async () => {
    const logins = ['u1', 'u2', 'u3', 'u4', 'u5']
    const people = await setup(logins)
    const res = await Promise.all(logins.map((l) => poll(db, people[l]!)))
    expect(res.filter((s) => s.state === 'holding')).toHaveLength(1)
    const rows = await db.select().from(landPlace)
    expect(rows.filter((r) => r.state === 'holding')).toHaveLength(1)
    expect(
      res
        .filter((s) => s.state === 'waiting')
        .map((s) => s.position)
        .sort(),
    ).toEqual([1, 2, 3, 4])
  })

  it('loses the place when the member is removed from the project', async () => {
    const { alice, bob } = await setup(['alice', 'bob'])
    await poll(db, alice!)
    await poll(db, bob!)
    await db
      .delete(membership)
      .where(and(eq(membership.projectId, alice!.project.id), eq(membership.userId, alice!.userId)))
    expect(await poll(db, bob!)).toMatchObject({ state: 'holding' })
    expect(await outcomes(alice!)).toEqual(['removed'])
  })

  describe('with fake time', () => {
    const T0 = new Date('2026-01-01T12:00:00Z').getTime()
    const MIN = 60_000
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(T0)
    })

    it('skips a member granted by a hand-over who never picks up', async () => {
      const { alice, bob, carol } = await setup(['alice', 'bob', 'carol'])
      await poll(db, alice!)
      await poll(db, bob!)
      await poll(db, carol!)
      vi.setSystemTime(T0 + 10_000)
      await unlock(db, alice!, true)
      vi.setSystemTime(T0 + 100_000)
      await poll(db, carol!)
      vi.setSystemTime(T0 + 131_000)
      expect(await poll(db, carol!)).toMatchObject({ state: 'holding' })
      expect(await outcomes(bob!)).toEqual(['skipped'])
    })

    it('drops a waiter silent for over 300 seconds', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      await poll(db, bob!)
      vi.setSystemTime(T0 + 301_000)
      await poll(db, alice!)
      expect(await outcomes(bob!)).toEqual(['expired'])
    })

    it('gives no expired notice to a waiter dropped for silence', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      await poll(db, bob!)
      vi.setSystemTime(T0 + 301_000)
      expect(await poll(db, bob!, false)).toEqual({ state: 'ended', outcome: 'expired' })
      expect(await unlock(db, bob!, true)).toEqual({ ended: null })
    })

    it('keeps a holder at 59 minutes', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      await poll(db, bob!, true)
      vi.setSystemTime(T0 + 59 * MIN)
      await poll(db, bob!)
      expect(await poll(db, alice!, false)).toMatchObject({ state: 'holding' })
    })

    it('expires a silent holder after 60 minutes and says so on the next request', async () => {
      const { alice } = await setup(['alice'])
      await poll(db, alice!)
      vi.setSystemTime(T0 + 61 * MIN)
      const s = await poll(db, alice!)
      expect(s.notice).toMatch(/expired/)
      expect(s.state).toBe('holding')
      expect(await outcomes(alice!)).toEqual(['expired', null])
    })

    it('keeps the expired notice through an ask that has to wait', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      vi.setSystemTime(T0 + 61 * MIN)
      expect(await poll(db, bob!)).toMatchObject({ state: 'holding' })
      // ask needs a moving clock for its deadline
      vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true })
      vi.setSystemTime(T0 + 61 * MIN + 1_000)
      const s = await ask(db, alice!, 600, 200)
      expect(s).toMatchObject({ state: 'waiting', position: 1 })
      expect(s.notice).toMatch(/expired/)
    })

    it('answers unlock after an expired hold with the notice', async () => {
      const { alice } = await setup(['alice'])
      await poll(db, alice!)
      vi.setSystemTime(T0 + 61 * MIN)
      const r = await unlock(db, alice!, true)
      expect(r.ended).toBeNull()
      expect(r.notice).toMatch(/expired/)
    })
  })

  describe('ask', () => {
    it('returns holding soon after the holder unlocks', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      const t0 = Date.now()
      const pending = ask(db, bob!, 3000, 200)
      await new Promise((r) => setTimeout(r, 300))
      await unlock(db, alice!, true)
      expect(await pending).toMatchObject({ state: 'holding' })
      expect(Date.now() - t0).toBeLessThan(2000)
    })

    it('reports a dashboard removal instead of re-queueing', async () => {
      const { alice, bob, carol } = await setup(['alice', 'bob', 'carol'])
      await poll(db, alice!)
      const pending = ask(db, bob!, 3000, 200)
      await new Promise((r) => setTimeout(r, 300))
      const [place] = await db.select().from(landPlace).where(eq(landPlace.userId, bob!.userId))
      await endById(db, bob!.project.id, place!.id, carol!.userId)
      const s = await pending
      expect(s.state).toBe('ended')
      expect(s.notice).toMatch(/^your place for the landing lock was removed on the dashboard by @carol$/)
      expect(await outcomes(bob!)).toEqual(['removed'])
    })

    it('tells a holder opened from the dashboard on its next unlock', async () => {
      const { alice, carol } = await setup(['alice', 'carol'])
      await poll(db, alice!)
      const [place] = await db.select().from(landPlace).where(eq(landPlace.userId, alice!.userId))
      await endById(db, alice!.project.id, place!.id, carol!.userId)
      const r = await unlock(db, alice!, true)
      expect(r.ended).toBeNull()
      expect(r.notice).toMatch(/opened on the dashboard by @carol/)
    })

    it('stops polling when the client goes away, so the lock is not granted to it', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      const abort = new AbortController()
      const pending = ask(db, bob!, 3000, 200, abort.signal)
      await new Promise((r) => setTimeout(r, 300))
      abort.abort()
      expect(await pending).toMatchObject({ state: 'waiting' })
      const checkIns = async () =>
        (await db.select().from(landPlace).where(eq(landPlace.userId, bob!.userId))).map((p) =>
          p.checkedInAt.getTime(),
        )
      const before = await checkIns()
      // The hand-over still reaches bob's place, but nothing polls for it any more: it is never picked up.
      await unlock(db, alice!, true)
      await new Promise((r) => setTimeout(r, 500))
      expect(await checkIns()).toEqual(before)
    })

    it('returns waiting after the deadline when nothing changes', async () => {
      const { alice, bob } = await setup(['alice', 'bob'])
      await poll(db, alice!)
      expect(await ask(db, bob!, 500, 200)).toMatchObject({ state: 'waiting', position: 1 })
    })
  })
})
