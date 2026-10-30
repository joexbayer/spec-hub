import { setTimeout as sleep } from 'node:timers/promises'
import { advance, estimateMinutes, type LivePlace, type Outcome } from '@spec-hub/core'
import { and, desc, eq, lt, ne, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { Db, Tx } from '../db/client.ts'
import { landPlace, membership, user } from '../db/schema.ts'
import { audit } from './audit.ts'

export type Status = {
  state: 'waiting' | 'holding' | 'ended' | 'none'
  outcome?: Outcome
  position?: number
  holder?: { login: string; minutes: number } | null
  etaMinutes?: number
  notice?: string
}

const RECENT_END_MS = 60 * 60_000

// Loads the live places, lets advance() decide, and applies grants and lapses. The one grant rule.
async function settle(tx: Tx, projectId: string, now: Date): Promise<void> {
  const rows = await tx
    .select({
      id: landPlace.id,
      state: landPlace.state,
      startedAt: landPlace.startedAt,
      checkedInAt: landPlace.checkedInAt,
      memberUserId: membership.userId,
    })
    .from(landPlace)
    .leftJoin(
      membership,
      and(eq(membership.projectId, landPlace.projectId), eq(membership.userId, landPlace.userId)),
    )
    .where(and(eq(landPlace.projectId, projectId), ne(landPlace.state, 'ended')))
    .orderBy(landPlace.id)
  const places: LivePlace[] = rows.map((r) => ({
    id: r.id,
    state: r.state === 'holding' ? 'holding' : 'waiting',
    startedAt: r.startedAt?.getTime() ?? null,
    checkedInAt: r.checkedInAt.getTime(),
    pickedUp: r.startedAt != null && r.checkedInAt >= r.startedAt,
    member: r.memberUserId != null,
  }))
  for (const change of advance(places, now.getTime())) {
    if ('grant' in change) {
      await tx
        .update(landPlace)
        .set({ state: 'holding', startedAt: now })
        .where(and(eq(landPlace.id, change.id), eq(landPlace.state, 'waiting')))
    } else {
      await endPlace(tx, change.id, change.end, now)
    }
  }
}

// The only way into the queue: one transaction, serialised per project, with lapsed places
// settled before `act` sees the queue. Nothing runs in the background; every call advances.
export async function withQueue<T>(
  db: Db,
  projectId: string,
  act: (tx: Tx, now: Date) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`land:${projectId}`}))`)
    const now = new Date()
    await settle(tx, projectId, now)
    return act(tx, now)
  })
}

// History is never rewritten: an already ended place keeps its outcome.
async function endPlace(
  tx: Tx,
  id: number,
  outcome: Outcome,
  now: Date,
  endedBy: string | null = null,
): Promise<void> {
  await tx
    .update(landPlace)
    .set({ state: 'ended', outcome, endedAt: now, endedBy })
    .where(and(eq(landPlace.id, id), ne(landPlace.state, 'ended')))
}

const EXPIRED_NOTICE =
  'your previous hold of the landing lock expired; a land made then was not protected by the lock'
const removedNotice = (login: string, hold: boolean) =>
  hold
    ? `your hold of the landing lock was opened on the dashboard by @${login}; a land made after that was not protected by the lock`
    : `your place for the landing lock was removed on the dashboard by @${login}`

// Newest ten landed holds, in ms: the basis of every wait estimate.
async function landedDurations(tx: Tx, projectId: string): Promise<number[]> {
  const landed = await tx
    .select({ startedAt: landPlace.startedAt, endedAt: landPlace.endedAt })
    .from(landPlace)
    .where(and(eq(landPlace.projectId, projectId), eq(landPlace.outcome, 'landed')))
    .orderBy(desc(landPlace.id))
    .limit(10)
  return landed.flatMap((r) =>
    r.startedAt && r.endedAt ? [r.endedAt.getTime() - r.startedAt.getTime()] : [],
  )
}

async function statusFor(
  tx: Tx,
  project: { id: string; defaultBranch: string },
  userId: string,
  now: Date,
): Promise<Status> {
  const [own] = await tx
    .select()
    .from(landPlace)
    .where(and(eq(landPlace.projectId, project.id), eq(landPlace.userId, userId)))
    .orderBy(desc(landPlace.id))
    .limit(1)
  if (!own) return { state: 'none' }
  if (own.state === 'ended') {
    if (!own.outcome || !own.endedAt || now.getTime() - own.endedAt.getTime() > RECENT_END_MS)
      return { state: 'none' }
    // Only a real hold expires into a notice: a waiter dropped for silence never held the lock.
    let notice: string | undefined
    if (own.outcome === 'expired' && own.startedAt != null) notice = EXPIRED_NOTICE
    if (own.outcome === 'removed' && own.endedBy != null) {
      const [by] = await tx.select({ login: user.githubLogin }).from(user).where(eq(user.id, own.endedBy))
      if (by) notice = removedNotice(by.login, own.startedAt != null)
    }
    return { state: 'ended', outcome: own.outcome, ...(notice ? { notice } : {}) }
  }

  const [h] = await tx
    .select({ login: user.githubLogin, startedAt: landPlace.startedAt })
    .from(landPlace)
    .innerJoin(user, eq(user.id, landPlace.userId))
    .where(and(eq(landPlace.projectId, project.id), eq(landPlace.state, 'holding')))
  const holder = h
    ? {
        login: h.login,
        minutes: Math.floor((now.getTime() - (h.startedAt?.getTime() ?? now.getTime())) / 60_000),
      }
    : null

  if (own.state === 'holding') return { state: 'holding', holder }

  // 1 = next: equals the live places ahead when someone holds, and stays 1 when nobody does.
  const ahead = await tx
    .select({ state: landPlace.state })
    .from(landPlace)
    .where(and(eq(landPlace.projectId, project.id), ne(landPlace.state, 'ended'), lt(landPlace.id, own.id)))
  const durations = await landedDurations(tx, project.id)
  const waitingAhead = ahead.filter((p) => p.state === 'waiting').length
  return {
    state: 'waiting',
    position: waitingAhead + 1,
    holder,
    etaMinutes: estimateMinutes(waitingAhead, holder != null, durations),
  }
}

export type LandCaller = {
  project: { id: string; defaultBranch: string }
  userId: string
}

const livePlace = (c: LandCaller) =>
  and(eq(landPlace.projectId, c.project.id), eq(landPlace.userId, c.userId), ne(landPlace.state, 'ended'))

// Join or check in. A check-in (join = false) never creates a place.
export async function poll(db: Db, c: LandCaller, join = true): Promise<Status> {
  return withQueue(db, c.project.id, async (tx, now) => {
    const updated = await tx
      .update(landPlace)
      .set({ checkedInAt: now })
      .where(livePlace(c))
      .returning({ id: landPlace.id })
    // A new request right after an expired hold carries the expired notice once (FR-013).
    const before = updated.length === 0 && join ? await statusFor(tx, c.project, c.userId, now) : null
    if (updated.length === 0 && join) {
      await tx
        .insert(landPlace)
        .values({
          projectId: c.project.id,
          userId: c.userId,
          state: 'waiting',
          askedAt: now,
          checkedInAt: now,
        })
        .onConflictDoNothing()
    }
    // Again with this check-in counted: the member may be next. A grant here is already picked up
    // (checked_in_at = started_at = now).
    await settle(tx, c.project.id, now)
    const s = await statusFor(tx, c.project, c.userId, now)
    return before?.notice ? { ...s, notice: before.notice } : s
  })
}

// Polls until the member holds the lock or the deadline nears. Each poll is its own short
// transaction; no connection is held between checks. Only the first poll joins: a place ended
// meanwhile (removed on the dashboard, dropped) is reported, not silently re-queued. An aborted
// `signal` (the client went away) stops the polling so a lock is not granted to nobody.
export async function ask(
  db: Db,
  c: LandCaller,
  deadlineMs = 25_000,
  everyMs = 2_000,
  signal?: AbortSignal,
): Promise<Status> {
  const until = Date.now() + deadlineMs
  let notice: string | undefined // the first poll's notice is kept for the answer
  let s = await poll(db, c, true)
  for (;;) {
    notice = s.notice ?? notice
    if (s.state !== 'waiting' || Date.now() + everyMs > until) return notice ? { ...s, notice } : s
    await sleep(everyMs)
    if (signal?.aborted) return notice ? { ...s, notice } : s
    s = await poll(db, c, false)
  }
}

// Ends the member's live place: holding → landed/released, waiting → left. With no live place,
// `ended` is null and `notice` says if the last hold expired, so that is not mistaken for a clean unlock.
export async function unlock(
  db: Db,
  c: LandCaller,
  landed: boolean,
): Promise<{ ended: Outcome | null; notice?: string }> {
  return withQueue(db, c.project.id, async (tx, now) => {
    const [own] = await tx
      .select({ id: landPlace.id, state: landPlace.state })
      .from(landPlace)
      .where(livePlace(c))
    if (!own) {
      const { notice } = await statusFor(tx, c.project, c.userId, now)
      return { ended: null, ...(notice ? { notice } : {}) }
    }
    const ended = own.state === 'holding' ? (landed ? 'landed' : 'released') : 'left'
    await endPlace(tx, own.id, ended, now)
    // Hand over in the same transaction so the next waiter does not wait for a poll.
    await settle(tx, c.project.id, now)
    return { ended }
  })
}

export type QueueView = {
  holder: { id: number; login: string; startedAt: number; minutes: number } | null
  waiting: Array<{
    id: number
    login: string
    askedAt: number
    position: number
    etaMinutes: number
    mine: boolean
  }>
  history: Array<{
    id: number
    login: string
    startedAt: number | null
    endedAt: number
    outcome: Outcome
    endedBy: string | null
  }>
  minutesPerTurn: number
}

// What the dashboard shows: holder, waiting places in order, and the last 20 ended places.
export async function loadQueueView(
  tx: Tx,
  projectId: string,
  userId: string,
  now: Date,
): Promise<QueueView> {
  const live = await tx
    .select({
      id: landPlace.id,
      state: landPlace.state,
      userId: landPlace.userId,
      login: user.githubLogin,
      askedAt: landPlace.askedAt,
      startedAt: landPlace.startedAt,
    })
    .from(landPlace)
    .innerJoin(user, eq(user.id, landPlace.userId))
    .where(and(eq(landPlace.projectId, projectId), ne(landPlace.state, 'ended')))
    .orderBy(landPlace.id)
  const durations = await landedDurations(tx, projectId)
  const h = live.find((p) => p.state === 'holding')
  const holder = h
    ? {
        id: h.id,
        login: h.login,
        startedAt: (h.startedAt ?? now).getTime(),
        minutes: Math.floor((now.getTime() - (h.startedAt ?? now).getTime()) / 60_000),
      }
    : null
  const waiting = live
    .filter((p) => p.state === 'waiting')
    .map((p, i) => ({
      id: p.id,
      login: p.login,
      askedAt: p.askedAt.getTime(),
      position: i + 1,
      etaMinutes: estimateMinutes(i, holder != null, durations),
      mine: p.userId === userId,
    }))
  const ender = alias(user, 'ender')
  const ended = await tx
    .select({
      id: landPlace.id,
      login: user.githubLogin,
      startedAt: landPlace.startedAt,
      endedAt: landPlace.endedAt,
      outcome: landPlace.outcome,
      endedBy: ender.githubLogin,
    })
    .from(landPlace)
    .innerJoin(user, eq(user.id, landPlace.userId))
    .leftJoin(ender, eq(ender.id, landPlace.endedBy))
    .where(and(eq(landPlace.projectId, projectId), eq(landPlace.state, 'ended')))
    .orderBy(desc(landPlace.endedAt), desc(landPlace.id))
    .limit(20)
  const history = ended.flatMap((r) =>
    r.endedAt && r.outcome
      ? [
          {
            id: r.id,
            login: r.login,
            startedAt: r.startedAt?.getTime() ?? null,
            endedAt: r.endedAt.getTime(),
            outcome: r.outcome,
            endedBy: r.endedBy,
          },
        ]
      : [],
  )
  return { holder, waiting, history, minutesPerTurn: estimateMinutes(1, false, durations) }
}

// Any member may end a place from the dashboard: their own (released/left) or someone else's
// (removed, with who did it). Null when the place is not live in this project.
export async function endById(
  db: Db,
  projectId: string,
  placeId: number,
  byUserId: string,
): Promise<{ ended: Outcome; owner: string } | null> {
  return withQueue(db, projectId, async (tx, now) => {
    const [place] = await tx
      .select({ state: landPlace.state, userId: landPlace.userId })
      .from(landPlace)
      .where(and(eq(landPlace.id, placeId), eq(landPlace.projectId, projectId), ne(landPlace.state, 'ended')))
    if (!place) return null
    const own = place.userId === byUserId
    const ended: Outcome = !own ? 'removed' : place.state === 'holding' ? 'released' : 'left'
    await endPlace(tx, placeId, ended, now, own ? null : byUserId)
    if (!own)
      await audit(tx, {
        type: 'land_removed',
        actorUserId: byUserId,
        projectId,
        detail: { placeId, owner: place.userId },
      })
    await settle(tx, projectId, now)
    return { ended, owner: place.userId }
  })
}
