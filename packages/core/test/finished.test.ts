import { describe, expect, it } from 'vitest'
import { buildFinished, finishedFeature, matchFinished } from '../src/finished.ts'
import type { DocFacts, FinishedRow, MemberIdentity } from '../src/types.ts'

const doc = (over: Partial<DocFacts> = {}): DocFacts => ({
  title: null,
  ownerHandle: null,
  dependsOn: [],
  openClarifications: 0,
  tasksDone: 0,
  tasksTotal: 0,
  tooLarge: false,
  unreadable: false,
  ...over,
})

const row = (over: Partial<FinishedRow> = {}): FinishedRow => ({
  dir: '001-first',
  firstSeenAt: 1000,
  baseline: false,
  addedAt: 500,
  lastChangeAt: 900,
  author: null,
  spec: null,
  plan: null,
  tasks: null,
  ...over,
})

const members: MemberIdentity[] = [
  { userId: 'u1', githubLogin: 'Ada', name: 'Ada L', image: null, emails: ['ada@x.io'] },
]
const none = new Set<string>()
const one = (r: FinishedRow) => finishedFeature(r, members, 'sequential', none)

describe('finishedFeature', () => {
  it('landedAt is firstSeenAt, or addedAt for baseline rows', () => {
    expect(one(row()).landedAt).toBe(1000)
    expect(one(row({ baseline: true })).landedAt).toBe(500)
    expect(one(row({ baseline: true, addedAt: null })).landedAt).toBeNull()
  })

  it('owner header wins over the author email', () => {
    const f = one(
      row({
        spec: doc({ ownerHandle: 'bob' }),
        author: { name: 'Ada L', email: 'ada@x.io' },
      }),
    )
    expect(f.owner).toEqual({ kind: 'handle', handle: 'bob' })
    const g = one(row({ author: { name: 'Ada L', email: 'ada@x.io' } }))
    expect(g.owner.kind).toBe('member')
  })

  it('title falls back to the folder name', () => {
    expect(one(row({ dir: '079-tenant-keys' })).title).toBe('Tenant keys')
    expect(one(row({ spec: doc({ title: 'Real' }) })).title).toBe('Real')
  })

  it('tasks is null when the total is 0', () => {
    expect(one(row({ tasks: doc() })).tasks).toBeNull()
    expect(one(row({ tasks: doc({ tasksDone: 2, tasksTotal: 5 }) })).tasks).toEqual({
      done: 2,
      total: 5,
    })
  })

  it('reported is false without addedAt; inFlight follows activeDirs', () => {
    expect(one(row({ addedAt: null })).reported).toBe(false)
    expect(one(row()).reported).toBe(true)
    expect(finishedFeature(row(), members, 'sequential', new Set(['001-first'])).inFlight).toBe(true)
  })
})

describe('buildFinished', () => {
  it('orders newest first, unknown last, ties by dir', () => {
    const rows = [
      row({ dir: '004-d', baseline: true, addedAt: null }),
      row({ dir: '003-c', firstSeenAt: 10 }),
      row({ dir: '002-b', firstSeenAt: 20 }),
      row({ dir: '001-a', firstSeenAt: 20 }),
    ]
    expect(buildFinished(rows, members, 'sequential', none).map((f) => f.dir)).toEqual([
      '001-a',
      '002-b',
      '003-c',
      '004-d',
    ])
  })
})

describe('matchFinished', () => {
  const list = buildFinished(
    [
      row({ dir: '001-auth', firstSeenAt: 1, author: { name: 'Ada L', email: 'ada@x.io' } }),
      row({ dir: '002-billing', firstSeenAt: 2, spec: doc({ title: 'Billing 001' }) }),
      row({ dir: '010-search', firstSeenAt: 3, spec: doc({ ownerHandle: 'bob' }) }),
    ],
    members,
    'sequential',
    none,
  )

  it('puts an exact number first', () => {
    expect(matchFinished(list, '001').map((f) => f.dir)).toEqual(['001-auth', '002-billing'])
  })

  it('matches title and dir case-insensitively', () => {
    expect(matchFinished(list, 'BILLING').map((f) => f.dir)).toEqual(['002-billing'])
    expect(matchFinished(list, ' Search ').map((f) => f.dir)).toEqual(['010-search'])
  })

  it('filters by owner key; empty query returns all of them', () => {
    expect(matchFinished(list, '', 'ADA').map((f) => f.dir)).toEqual(['001-auth'])
    expect(matchFinished(list, '').length).toBe(3)
    expect(matchFinished(list, 'search', 'ada')).toEqual([])
  })
})
