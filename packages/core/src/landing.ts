// Landing-lock rules: who is dropped, who is given the lock, and how long a wait looks. Pure; the caller supplies `now`.

export const PICKUP_MS = 120_000
export const WAIT_MS = 300_000
export const HOLD_MS = 60 * 60_000
export const DEFAULT_TURN_MINUTES = 20

export type LiveState = 'waiting' | 'holding'
export type Outcome = 'landed' | 'released' | 'expired' | 'skipped' | 'left' | 'removed'

export interface LivePlace {
  id: number
  state: LiveState
  startedAt: number | null
  checkedInAt: number
  // checked_in_at >= started_at: the member has called since being given the lock.
  pickedUp: boolean
  member: boolean
}

export type Change = { id: number; end: Outcome } | { id: number; grant: true }

// `places` are live places, oldest first (queue order).
export function advance(places: readonly LivePlace[], now: number): Change[] {
  const changes: Change[] = []
  const live: LivePlace[] = []
  for (const p of places) {
    if (!p.member) changes.push({ id: p.id, end: 'removed' })
    else if (p.state === 'holding' && !p.pickedUp && now - (p.startedAt ?? 0) > PICKUP_MS)
      changes.push({ id: p.id, end: 'skipped' })
    else if (now - p.checkedInAt > (p.state === 'holding' ? HOLD_MS : WAIT_MS))
      changes.push({ id: p.id, end: 'expired' })
    else live.push(p)
  }
  if (!live.some((p) => p.state === 'holding')) {
    // A waiter silent past PICKUP_MS is passed over, not dropped until WAIT_MS.
    const next = live.find((p) => p.state === 'waiting' && now - p.checkedInAt <= PICKUP_MS)
    if (next) changes.push({ id: next.id, grant: true })
  }
  return changes
}

function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = s.length >> 1
  const at = (i: number) => s[i] ?? 0 // callers pass at least 3 values
  return s.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2
}

// Needs 3+ landed turns before trusting history; uses the first 10 given (caller orders them).
export function estimateMinutes(
  ahead: number,
  holding: boolean,
  landedDurationsMs: readonly number[],
): number {
  const perTurn =
    landedDurationsMs.length < 3 ? DEFAULT_TURN_MINUTES : median(landedDurationsMs.slice(0, 10)) / 60_000
  return Math.ceil((ahead + (holding ? 0.5 : 0)) * perTurn)
}
