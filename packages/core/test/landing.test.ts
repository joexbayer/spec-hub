import { describe, expect, it } from 'vitest'
import { advance, estimateMinutes, type LivePlace } from '../src/landing.ts'

const now = 1_000_000_000
const min = 60_000

const place = (o: Partial<LivePlace> & { id: number }): LivePlace => ({
  state: 'waiting',
  startedAt: null,
  checkedInAt: now - 1_000,
  pickedUp: false,
  member: true,
  ...o,
})

describe('advance', () => {
  it('grants the first waiter only (FIFO)', () => {
    expect(advance([place({ id: 1 }), place({ id: 2 })], now)).toEqual([{ id: 1, grant: true }])
  })

  it('grants at most one with several eligible waiters', () => {
    const changes = advance([place({ id: 1 }), place({ id: 2 }), place({ id: 3 })], now)
    expect(changes.filter((c) => 'grant' in c)).toHaveLength(1)
  })

  it('does not grant while a live place is holding', () => {
    const holder = place({ id: 1, state: 'holding', startedAt: now - 1_000, pickedUp: true })
    expect(advance([holder, place({ id: 2 })], now)).toEqual([])
  })

  it('skips an unpicked holder, keeps a fresh one', () => {
    expect(advance([place({ id: 1, state: 'holding', startedAt: now - 121_000 })], now)).toEqual([
      { id: 1, end: 'skipped' },
    ])
    expect(advance([place({ id: 1, state: 'holding', startedAt: now - 60_000 })], now)).toEqual([])
  })

  it('keeps a picked-up holder silent for 301s and 59min, expires it at 61min', () => {
    const holder = (silentMs: number) =>
      place({
        id: 1,
        state: 'holding',
        startedAt: now - 70 * min,
        pickedUp: true,
        checkedInAt: now - silentMs,
      })
    expect(advance([holder(301_000)], now)).toEqual([])
    expect(advance([holder(59 * min)], now)).toEqual([])
    expect(advance([holder(61 * min)], now)).toEqual([{ id: 1, end: 'expired' }])
  })

  it('passes over a waiter silent for 150s and grants the next fresh one; expires at 301s', () => {
    const silent = place({ id: 1, checkedInAt: now - 150_000 })
    const fresh = place({ id: 2 })
    expect(advance([silent, fresh], now)).toEqual([{ id: 2, grant: true }])
    expect(advance([place({ id: 1, checkedInAt: now - 301_000 })], now)).toEqual([{ id: 1, end: 'expired' }])
  })

  it('removes a non-member and grants the next waiter when it was the holder', () => {
    const gone = place({ id: 1, state: 'holding', startedAt: now - 1_000, pickedUp: true, member: false })
    expect(advance([gone, place({ id: 2 })], now)).toEqual([
      { id: 1, end: 'removed' },
      { id: 2, grant: true },
    ])
    expect(advance([place({ id: 1, member: false })], now)).toEqual([{ id: 1, end: 'removed' }])
  })

  it('grants the first fresh waiter in the same call the holder expires', () => {
    const holder = place({
      id: 1,
      state: 'holding',
      startedAt: now - 70 * min,
      pickedUp: true,
      checkedInAt: now - 61 * min,
    })
    expect(advance([holder, place({ id: 2 }), place({ id: 3 })], now)).toEqual([
      { id: 1, end: 'expired' },
      { id: 2, grant: true },
    ])
  })
})

describe('estimateMinutes', () => {
  it('uses 20 min per turn with fewer than 3 durations', () => {
    expect(estimateMinutes(2, false, [])).toBe(40)
    expect(estimateMinutes(0, true, [5 * min, 5 * min])).toBe(10)
  })

  it('uses the median of odd and even sets', () => {
    expect(estimateMinutes(1, false, [10 * min, 20 * min, 30 * min])).toBe(20)
    expect(estimateMinutes(1, false, [10 * min, 20 * min, 30 * min, 40 * min])).toBe(25)
  })

  it('uses only the first 10 durations', () => {
    const d = [...Array(10).fill(10 * min), 1000 * min, 1000 * min]
    expect(estimateMinutes(1, false, d)).toBe(10)
  })

  it('counts half a turn for the holder and rounds up', () => {
    expect(estimateMinutes(1, true, [20 * min, 20 * min, 20 * min])).toBe(30)
    expect(estimateMinutes(1, true, [7 * min, 7 * min, 7 * min])).toBe(11)
  })
})
