import type { Board, BoardEntry } from '@spec-hub/core'
import type { FeatureDetail } from '@spec-hub/server/board-query'
import { expect, test } from 'vitest'
import { buildNeighbourhood, buildVersionElements } from '@/features/feature-detail/graph-elements'

const entry = (dir: string, dependsOn: string[] = []): BoardEntry => ({
  dir,
  number: dir.slice(0, 3),
  title: dir,
  owner: { kind: 'handle', handle: 'ana' },
  phase: { kind: 'plan' },
  openClarifications: 0,
  dependsOn,
  branches: [],
  lastChangeAt: 0,
  changesLandedFeature: false,
  collisions: [],
})

const board = (inFlight: BoardEntry[]): Board => ({
  inFlight,
  stale: [],
  recentlyLanded: [],
  landedDirs: [],
  members: [{ userId: 'u1', githubLogin: 'ana', name: 'Ana', image: null, emails: [] }],
})

test('versions: two carriers with one branch each', () => {
  const v = (branch: string, carrierUserId: string) => ({
    branch,
    carrierUserId,
    pushed: true,
    lastChangeAt: 1,
    spec: null,
    plan: null,
    tasks: null,
  })
  const detail: FeatureDetail = {
    entry: entry('001-a'),
    landed: null,
    versions: [v('x', 'u1'), v('y', 'u2')],
    shown: null,
  }
  const { nodes, edges } = buildVersionElements(detail, board([]))
  const count = (t: string) => nodes.filter((n) => n.type === t).length
  expect([count('person'), count('branch'), count('feature')]).toEqual([2, 2, 2])
  expect(edges).toHaveLength(4)
})

test('neighbourhood: two hops each way', () => {
  const chain = board([
    entry('001-a'),
    entry('002-b', ['001-a']),
    entry('003-c', ['002-b']),
    entry('004-d', ['003-c']),
  ])
  const ids = (dir: string) =>
    buildNeighbourhood(chain, dir)
      .nodes.map((n) => n.id)
      .sort()
  expect(ids('002-b')).toEqual(['001-a', '002-b', '003-c', '004-d'])
  expect(ids('001-a')).toEqual(['001-a', '002-b', '003-c'])
})
