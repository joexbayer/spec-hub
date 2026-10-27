import { describe, expect, it } from 'vitest'
import { buildDependencyGraph, buildPipeline, buildWorkMap } from '../src/graphs.ts'
import { PHASE_ORDER } from '../src/phase.ts'
import type { Board, BoardEntry, BranchRef, MemberIdentity, Owner, Phase } from '../src/types.ts'

const NOW = 1_800_000_000_000

const entry = (dir: string, over: Partial<BoardEntry> = {}): BoardEntry => ({
  dir,
  number: null,
  title: dir,
  owner: { kind: 'unknown' },
  phase: { kind: 'specify' },
  openClarifications: 0,
  dependsOn: [],
  branches: [],
  lastChangeAt: NOW,
  changesLandedFeature: false,
  collisions: [],
  ...over,
})
const member = (userId: string, githubLogin: string): MemberIdentity => ({
  userId,
  githubLogin,
  name: githubLogin.toUpperCase(),
  image: null,
  emails: [],
})
const ref = (carrierUserId: string, branch: string, over: Partial<BranchRef> = {}): BranchRef => ({
  branch,
  pushed: true,
  lastChangeAt: NOW,
  carrierUserId,
  ...over,
})
const board = (inFlight: BoardEntry[], over: Partial<Board> = {}): Board => ({
  inFlight,
  stale: [],
  recentlyLanded: [],
  landedDirs: [],
  members: [],
  ...over,
})

describe('buildPipeline', () => {
  it('places entries in phase columns, keeps empty columns, excludes stale, lists landed', () => {
    const landed = [{ dir: 'L', firstSeenAt: NOW, baseline: false }]
    const p = buildPipeline(
      board(
        [
          entry('a', { phase: { kind: 'plan' } }),
          entry('b', { phase: { kind: 'plan' } }),
          entry('c', { phase: { kind: 'tasks', total: 3 } }),
        ],
        { stale: [entry('s', { phase: { kind: 'plan' } })], recentlyLanded: landed },
      ),
    )
    expect(p.columns.map((c) => c.id)).toEqual([...PHASE_ORDER, 'landed'])
    const col = (id: string) => p.columns.find((c) => c.id === id)!
    expect(col('plan').entries.map((e) => e.dir)).toEqual(['a', 'b'])
    expect(col('tasks').entries.map((e) => e.dir)).toEqual(['c'])
    expect(col('specify').entries).toEqual([])
    expect(col('landed').landed).toEqual(landed)
  })
})

describe('buildWorkMap', () => {
  it('keeps per-person branch nodes, links multi-feature branches, flags unpushed, unknown owners', () => {
    const b = board(
      [
        entry('f1', {
          branches: [ref('u1', 'main-work'), ref('u2', 'main-work', { pushed: false, lastChangeAt: 5 })],
        }),
        entry('f2', { branches: [ref('u1', 'main-work', { lastChangeAt: NOW + 1 }), ref('ghost', 'x')] }),
      ],
      { members: [member('u1', 'alice'), member('u2', 'bob')] },
    )
    const w = buildWorkMap(b)
    expect(w.people.map((p) => p.userId)).toEqual(
      ['u1', 'u2', 'ghost'].sort((x, y) => {
        const l = (u: string) => (u === 'u1' ? 'alice' : u === 'u2' ? 'bob' : u)
        return l(x) < l(y) ? -1 : 1
      }),
    )
    expect(w.people.find((p) => p.userId === 'ghost')!.owner).toEqual({ kind: 'unknown' })
    expect(w.people.find((p) => p.userId === 'u1')!.owner).toMatchObject({
      kind: 'member',
      githubLogin: 'alice',
    })
    const ids = w.branches.map((x) => x.id)
    expect(ids).toContain('branch:u1:main-work')
    expect(ids).toContain('branch:u2:main-work')
    const a = w.branches.find((x) => x.id === 'branch:u1:main-work')!
    expect(a.dirs).toEqual(['f1', 'f2'])
    expect(a.lastChangeAt).toBe(NOW + 1)
    expect(w.branches.find((x) => x.id === 'branch:u2:main-work')!.pushed).toBe(false)
    expect(w.edges).toContainEqual({ from: 'person:u1', to: 'branch:u1:main-work' })
    expect(w.edges).toContainEqual({ from: 'branch:u1:main-work', to: 'feature:f1' })
    expect(w.edges).toContainEqual({ from: 'branch:u1:main-work', to: 'feature:f2' })
  })
})

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('FR-039 every view agrees with the list', () => {
  it('shows each in-flight feature with the same phase and owner in every view (200 random boards)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed)
      const int = (n: number) => Math.floor(r() * n)
      const pick = <T>(xs: readonly T[]): T => xs[int(xs.length)]!
      const members = ['u0', 'u1', 'u2'].map((id) => member(id, `login-${id}`))
      const dirs = Array.from({ length: 12 }, (_, i) => `d${i}`)
      const phases: Phase[] = [
        { kind: 'specify' },
        { kind: 'plan' },
        { kind: 'clarify', open: 1 },
        { kind: 'tasks', total: 4 },
        { kind: 'implement', done: 1, total: 4 },
        { kind: 'implemented', total: 4 },
      ]
      const owners = (): Owner =>
        pick<Owner>([
          { kind: 'unknown' },
          { kind: 'handle', handle: 'h' },
          { kind: 'git-name', name: 'g' },
          { kind: 'member', userId: 'u0', githubLogin: 'login-u0', name: 'N', image: null },
        ])
      const mk = (dir: string) =>
        entry(dir, {
          owner: owners(),
          phase: pick(phases),
          dependsOn: Array.from({ length: int(3) }, () => pick([...dirs, 'ext'])),
          branches: Array.from({ length: int(3) }, () =>
            ref(pick(['u0', 'u1', 'nobody']), pick(['a', 'b', 'c']), { pushed: r() < 0.5 }),
          ),
        })
      const picked = dirs.filter(() => r() < 0.7)
      const inFlight = picked.filter(() => r() < 0.7).map(mk)
      const inSet = new Set(inFlight.map((e) => e.dir))
      const stale = picked.filter((d) => !inSet.has(d)).map(mk)
      const b = board(inFlight, { stale, members, landedDirs: ['ext'] })

      const expected = [...inSet].sort()
      const pipeline = buildPipeline(b)
        .columns.filter((c) => c.id !== 'landed')
        .flatMap((c) => c.entries)
      const work = buildWorkMap(b).features
      const graph = [...buildDependencyGraph(b).nodes.values()].flatMap((n) =>
        n.kind === 'in-flight' && inSet.has(n.entry.dir) ? [n.entry] : [],
      )

      for (const view of [pipeline, work, graph]) {
        expect(view.map((e) => e.dir).sort()).toEqual(expected)
        for (const e of view) {
          const src = inFlight.find((x) => x.dir === e.dir)!
          expect(e.phase).toEqual(src.phase)
          expect(e.owner).toEqual(src.owner)
        }
      }
    }
  })
})
