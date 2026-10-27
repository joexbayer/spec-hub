import { describe, expect, it } from 'vitest'
import {
  buildBoard,
  compareVersions,
  featureNumber,
  isOwnBranch,
  titleFromDir,
  WINDOW_MS,
} from '../src/board.ts'
import type { DocFacts, FeatureVersion, LandedFeature, MemberIdentity } from '../src/types.ts'

const NOW = 1_800_000_000_000
const DAY = 24 * 60 * 60 * 1000

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
const version = (dir: string, over: Partial<FeatureVersion> = {}): FeatureVersion => ({
  dir,
  branch: dir,
  pushed: true,
  lastChangeAt: NOW - DAY,
  branchTipAt: NOW - DAY,
  carrierUserId: 'u1',
  author: null,
  spec: doc(),
  plan: null,
  tasks: null,
  ...over,
})
const ann: MemberIdentity = {
  userId: 'u1',
  githubLogin: 'ann',
  name: 'Ann',
  image: null,
  emails: ['ann@work.com'],
}
const bob: MemberIdentity = {
  userId: 'u2',
  githubLogin: 'bob',
  name: 'Bob',
  image: null,
  emails: ['bob@work.com'],
}
const members = [ann, bob]

const board = (
  versions: FeatureVersion[],
  landed: LandedFeature[] = [],
  numbering: 'sequential' | 'timestamp' = 'sequential',
) => buildBoard({ versions, landed, members, numbering, now: NOW })

describe('featureNumber', () => {
  it('sequential keeps leading zeros', () => {
    expect(featureNumber('104-ledger', 'sequential')).toBe('104')
    expect(featureNumber('007-bond', 'sequential')).toBe('007')
    expect(featureNumber('ledger', 'sequential')).toBeNull()
  })
  it('timestamp prefix', () => {
    expect(featureNumber('20261026-101500-ledger', 'timestamp')).toBe('20261026-101500')
    expect(featureNumber('104-ledger', 'timestamp')).toBeNull()
  })
})

describe('titleFromDir', () => {
  it('strips prefix, spaces words, capitalises', () => {
    expect(titleFromDir('104-team_board-view')).toBe('Team board view')
    expect(titleFromDir('20261026-101500-ledger')).toBe('Ledger')
    expect(titleFromDir('plain')).toBe('Plain')
  })
})

describe('buildBoard', () => {
  it('two members, one feature each', () => {
    const b = board([
      version('101-a', { author: { name: 'Ann', email: 'ann@work.com' }, plan: doc() }),
      version('102-b', {
        author: { name: 'Bob', email: 'bob@work.com' },
        spec: doc({ openClarifications: 2 }),
        lastChangeAt: NOW - 2 * DAY,
      }),
    ])
    expect(b.inFlight.map((e) => e.dir)).toEqual(['101-a', '102-b'])
    expect(b.inFlight[0]?.owner).toMatchObject({ kind: 'member', userId: 'u1' })
    expect(b.inFlight[0]?.phase).toEqual({ kind: 'plan' })
    expect(b.inFlight[1]?.owner).toMatchObject({ kind: 'member', userId: 'u2' })
    expect(b.inFlight[1]?.phase).toEqual({ kind: 'clarify', open: 2 })
    expect(b.inFlight[1]?.openClarifications).toBe(2)
    expect(b.members).toBe(members)
  })

  it('same dir in two clones -> one entry, newest shown, branches newest first', () => {
    const b = board([
      version('103-c', {
        branch: 'old',
        lastChangeAt: NOW - 3 * DAY,
        carrierUserId: 'u1',
        spec: doc({ title: 'Old' }),
      }),
      version('103-c', {
        branch: 'new',
        lastChangeAt: NOW - DAY,
        carrierUserId: 'u2',
        pushed: false,
        spec: doc({ title: 'New' }),
      }),
    ])
    expect(b.inFlight).toHaveLength(1)
    const e = b.inFlight[0]
    expect(e?.title).toBe('New')
    expect(e?.lastChangeAt).toBe(NOW - DAY)
    expect(e?.branches).toEqual([
      { branch: 'new', pushed: false, lastChangeAt: NOW - DAY, carrierUserId: 'u2' },
      { branch: 'old', pushed: true, lastChangeAt: NOW - 3 * DAY, carrierUserId: 'u1' },
    ])
  })

  it('ties on lastChangeAt pick the smallest branch name', () => {
    const b = board([
      version('103-c', { branch: 'zeta', spec: doc({ title: 'Z' }) }),
      version('103-c', { branch: 'alpha', spec: doc({ title: 'A' }) }),
    ])
    expect(b.inFlight[0]?.title).toBe('A')
  })

  it('same branch name in two clones: the carrier id breaks the tie, in either input order', () => {
    const a = version('104-d', { branch: 'main', carrierUserId: 'u2', spec: doc({ title: 'Bob' }) })
    const b = version('104-d', { branch: 'main', carrierUserId: 'u1', spec: doc({ title: 'Ann' }) })
    expect(board([a, b]).inFlight[0]?.title).toBe('Ann')
    expect(board([b, a]).inFlight[0]?.title).toBe('Ann')
    expect([a, b].sort(compareVersions)[0]).toBe(b)
  })

  it('stale after 14 days + 1 ms, not at exactly 14 days', () => {
    const b = board([
      version('104-edge', { lastChangeAt: NOW - WINDOW_MS, branchTipAt: NOW - WINDOW_MS }),
      version('105-old', { lastChangeAt: NOW - WINDOW_MS - 1, branchTipAt: NOW - WINDOW_MS - 1 }),
    ])
    expect(b.inFlight.map((e) => e.dir)).toEqual(['104-edge'])
    expect(b.stale.map((e) => e.dir)).toEqual(['105-old'])
  })

  it("work on the feature's own branch keeps it in flight; other branches' work does not", () => {
    const old = NOW - 20 * DAY
    const b = board([
      // the folder is untouched for 20 days, but its own branch got a commit an hour ago
      version('010-eval-gate', { lastChangeAt: old, branchTipAt: NOW - 3_600_000 }),
      version('011-scoped', { branch: 'joe/011-scoped', lastChangeAt: old, branchTipAt: NOW - DAY }),
      // a branch named after another feature (or nothing) only carries this one along
      version('004-nav', { branch: '020-web-tools', lastChangeAt: old, branchTipAt: NOW - DAY }),
      version('005-modes', { branch: 'worktree-agent-a10e', lastChangeAt: old, branchTipAt: NOW - DAY }),
    ])
    expect(b.inFlight.map((e) => e.dir)).toEqual(['010-eval-gate', '011-scoped'])
    expect(b.inFlight[0]?.lastChangeAt).toBe(NOW - 3_600_000)
    expect(b.stale.map((e) => e.dir).sort()).toEqual(['004-nav', '005-modes'])
  })

  it('isOwnBranch matches by number, in both numbering modes', () => {
    expect(isOwnBranch('010-continuous-eval-gate', '010-continuous-eval-gate', 'sequential')).toBe(true)
    expect(isOwnBranch('010-gate-v2', '010-continuous-eval-gate', 'sequential')).toBe(true)
    expect(isOwnBranch('feat/010-x', '010-continuous-eval-gate', 'sequential')).toBe(true)
    expect(isOwnBranch('0100-x', '010-y', 'sequential')).toBe(false)
    expect(isOwnBranch('main', '010-y', 'sequential')).toBe(false)
    expect(isOwnBranch('20261027-101500-x', '20261027-101500-y', 'timestamp')).toBe(true)
    expect(isOwnBranch('20261027-101501-x', '20261027-101500-y', 'timestamp')).toBe(false)
  })

  it('recentlyLanded excludes baseline and anything older than the window', () => {
    const b = board(
      [],
      [
        { dir: '001-base', firstSeenAt: NOW - DAY, baseline: true },
        { dir: '002-recent', firstSeenAt: NOW - 13 * DAY, baseline: false },
        { dir: '003-newer', firstSeenAt: NOW - 2 * DAY, baseline: false },
        { dir: '004-gone', firstSeenAt: NOW - 15 * DAY, baseline: false },
      ],
    )
    expect(b.recentlyLanded.map((l) => l.dir)).toEqual(['003-newer', '002-recent'])
    expect(b.landedDirs).toEqual(['001-base', '002-recent', '003-newer', '004-gone'])
  })

  it('in-flight collision flags both, naming each other', () => {
    const b = board([version('107-a'), version('107-b'), version('109-c')])
    const c = Object.fromEntries(b.inFlight.map((e) => [e.dir, e.collisions]))
    expect(c).toEqual({ '107-a': ['107-b'], '107-b': ['107-a'], '109-c': [] })
  })

  it('collision against a landed (baseline) feature; stale entries participate', () => {
    const b = board(
      [version('108-x'), version('110-old', { lastChangeAt: NOW - 20 * DAY, branchTipAt: NOW - 20 * DAY })],
      [
        { dir: '108-y', firstSeenAt: NOW - 100 * DAY, baseline: true },
        { dir: '110-done', firstSeenAt: NOW - DAY, baseline: false },
      ],
    )
    expect(b.inFlight[0]?.collisions).toEqual(['108-y'])
    expect(b.stale[0]?.collisions).toEqual(['110-done'])
  })

  it('no collision for timestamp numbering', () => {
    const b = board(
      [version('20261026-101500-a'), version('20261026-101500-b')],
      [{ dir: '20261026-101500-c', firstSeenAt: NOW, baseline: false }],
      'timestamp',
    )
    expect(b.inFlight.every((e) => e.collisions.length === 0)).toBe(true)
    expect(b.inFlight[0]?.number).toBe('20261026-101500')
  })

  it('changesLandedFeature when the dir is also landed, without self-collision', () => {
    const b = board(
      [version('111-z'), version('112-w')],
      [{ dir: '111-z', firstSeenAt: NOW - 50 * DAY, baseline: true }],
    )
    const e = b.inFlight.find((x) => x.dir === '111-z')
    expect(e?.changesLandedFeature).toBe(true)
    expect(e?.collisions).toEqual([])
    expect(b.inFlight.find((x) => x.dir === '112-w')?.changesLandedFeature).toBe(false)
  })

  it('self-dependency removed', () => {
    const b = board([version('113-q', { spec: doc({ dependsOn: ['113-q', '101-a'] }) })])
    expect(b.inFlight[0]?.dependsOn).toEqual(['101-a'])
  })

  it('title falls back to the dir when the spec has none (or is missing)', () => {
    const b = board([version('114-team-board'), version('115-no_spec', { spec: null })])
    const t = Object.fromEntries(b.inFlight.map((e) => [e.dir, e.title]))
    expect(t).toEqual({ '114-team-board': 'Team board', '115-no_spec': 'No spec' })
    expect(b.inFlight.find((e) => e.dir === '115-no_spec')?.openClarifications).toBe(0)
  })
})
