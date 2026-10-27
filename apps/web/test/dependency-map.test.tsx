import type { Board, BoardEntry } from '@spec-hub/core'
import { expect, test } from 'vitest'
import { buildMapElements, DEFAULT_FILTERS } from '@/features/dependency-map/map-elements'

const entry = (dir: string, dependsOn: string[]): BoardEntry =>
  ({
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
  }) as BoardEntry

const board = (inFlight: BoardEntry[], landedDirs: string[] = []): Board => ({
  inFlight,
  stale: [],
  recentlyLanded: [],
  landedDirs,
  members: [],
})

test('chain C -> B -> A: three nodes, two edges, all critical, B and C blocked', () => {
  const { nodes, edges } = buildMapElements(
    board([entry('001-a', []), entry('002-b', ['001-a']), entry('003-c', ['002-b'])]),
    DEFAULT_FILTERS,
  )
  expect(nodes).toHaveLength(3)
  expect(edges.map((e) => `${e.source}>${e.target}`).sort()).toEqual(['001-a>002-b', '002-b>003-c'])
  const data = (id: string) => nodes.find((n) => n.id === id)?.data as { blocked: boolean; critical: boolean }
  expect(nodes.every((n) => (n.data as { critical: boolean }).critical)).toBe(true)
  expect(data('001-a').blocked).toBe(false)
  expect(data('002-b').blocked).toBe(true)
  expect(data('003-c').blocked).toBe(true)
  expect(nodes.every((n) => typeof n.ariaLabel === 'string')).toBe(true)
})

test('show landed off removes landed nodes and their edges', () => {
  const b = board([entry('001-a', ['000-d'])], ['000-d'])
  const on = buildMapElements(b, DEFAULT_FILTERS)
  expect(on.nodes.map((n) => n.type).sort()).toEqual(['feature', 'landed'])
  expect(on.edges).toHaveLength(1)
  const off = buildMapElements(b, { ...DEFAULT_FILTERS, showLanded: false })
  expect(off.nodes.map((n) => n.type)).toEqual(['feature'])
  expect(off.edges).toHaveLength(0)
})

test('stale entries and dependencies only they need are hidden unless show stale is on', () => {
  const b = {
    ...board([entry('001-a', ['000-d'])], ['000-d', '000-e']),
    stale: [entry('002-old', ['000-e'])],
  }
  const off = buildMapElements(b, DEFAULT_FILTERS)
  expect(off.nodes.map((n) => n.id).sort()).toEqual(['000-d', '001-a'])
  const on = buildMapElements(b, { ...DEFAULT_FILTERS, showStale: true })
  expect(on.nodes.map((n) => n.id).sort()).toEqual(['000-d', '000-e', '001-a', '002-old'])
})
