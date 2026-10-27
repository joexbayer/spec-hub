import { describe, expect, it } from 'vitest'
import { buildDependencyGraph } from '../src/graphs.ts'
import type { Board, BoardEntry } from '../src/types.ts'

const NOW = 1_800_000_000_000

const entry = (dir: string, dependsOn: string[] = [], over: Partial<BoardEntry> = {}): BoardEntry => ({
  dir,
  number: null,
  title: dir,
  owner: { kind: 'unknown' },
  phase: { kind: 'specify' },
  openClarifications: 0,
  dependsOn,
  branches: [],
  lastChangeAt: NOW,
  changesLandedFeature: false,
  collisions: [],
  ...over,
})
const board = (inFlight: BoardEntry[], landedDirs: string[] = [], stale: BoardEntry[] = []): Board => ({
  inFlight,
  stale,
  recentlyLanded: [],
  landedDirs,
  members: [],
})

describe('buildDependencyGraph', () => {
  it('marks the spec example chain blocked and finds the critical path', () => {
    const g = buildDependencyGraph(board([entry('A'), entry('B', ['A']), entry('C', ['B'])]))
    expect([...g.blocked].sort()).toEqual(['B', 'C'])
    expect(g.blockedBy.get('B')).toEqual(['A'])
    expect(g.blockedBy.get('C')).toEqual(['B'])
    expect(g.blockedBy.has('A')).toBe(false)
    expect(g.criticalPath).toEqual(['A', 'B', 'C'])
    expect(g.cycles).toEqual([])
  })

  it('unblocks dependents once a dependency lands', () => {
    const g = buildDependencyGraph(board([entry('B', ['A']), entry('C', ['B'])], ['A']))
    expect(g.nodes.get('A')).toEqual({ kind: 'landed', dir: 'A' })
    expect(g.blocked.has('B')).toBe(false)
    expect(g.blockedBy.get('C')).toEqual(['B'])
    expect(g.criticalPath).toEqual(['B', 'C'])
  })

  it('de-duplicates edges in a diamond and picks a deterministic path', () => {
    const entries = [entry('A'), entry('B', ['A', 'A']), entry('C', ['A']), entry('D', ['B', 'C', 'B'])]
    const g = buildDependencyGraph(board(entries))
    const keys = g.edges.map((e) => `${e.from}->${e.to}`).sort()
    expect(keys).toEqual(['A->B', 'A->C', 'B->D', 'C->D'])
    expect(g.criticalPath).toEqual(['A', 'B', 'D'])
    expect(buildDependencyGraph(board([...entries].reverse())).criticalPath).toEqual(['A', 'B', 'D'])
    expect(g.blockedBy.get('D')).toEqual(['B', 'C'])
  })

  it('detects a cycle, marks its edges and still returns', () => {
    const g = buildDependencyGraph(
      board([entry('Y', ['X'], { lastChangeAt: NOW }), entry('X', ['Y'], { lastChangeAt: NOW - 1 })]),
    )
    expect(g.cycles).toEqual([['X', 'Y']])
    expect(g.edges).toHaveLength(2)
    expect(g.edges.every((e) => e.inCycle)).toBe(true)
    expect([...g.blocked].sort()).toEqual(['X', 'Y'])
    expect(g.criticalPath).toEqual([]) // a lone node is not a chain
  })

  it('treats an unknown dependency as not landed', () => {
    const g = buildDependencyGraph(board([entry('A', ['Z'])]))
    expect(g.nodes.get('Z')).toEqual({ kind: 'unknown', dir: 'Z' })
    expect(g.blockedBy.get('A')).toEqual(['Z'])
    expect(g.criticalPath).toEqual(['Z', 'A'])
  })

  it('does not block on an in-flight change to an already landed feature', () => {
    const g = buildDependencyGraph(
      board([entry('E', [], { changesLandedFeature: true }), entry('F', ['E'])], ['E']),
    )
    expect(g.nodes.get('E')?.kind).toBe('in-flight')
    expect(g.blocked.size).toBe(0)
    expect(g.criticalPath).toEqual([]) // a lone node is not a chain
  })

  it('ignores self links and "."', () => {
    const g = buildDependencyGraph(board([entry('A', ['A', '.'])]))
    expect(g.edges).toEqual([])
    expect(g.nodes.has('.')).toBe(false)
    expect(g.blocked.size).toBe(0)
    expect(g.cycles).toEqual([])
    expect(g.criticalPath).toEqual([]) // a lone node is not a chain
  })

  it('handles a 300-node chain and a 300-node cycle without recursion', () => {
    const n = 300
    const id = (i: number) => `f${String(i).padStart(3, '0')}`
    const chain = Array.from({ length: n }, (_, i) => entry(id(i), i === 0 ? [] : [id(i - 1)]))
    const start = performance.now()
    const g = buildDependencyGraph(board(chain))
    expect(g.criticalPath).toHaveLength(n)
    expect(g.criticalPath[0]).toBe(id(0))
    expect(g.criticalPath[n - 1]).toBe(id(n - 1))
    const ring = Array.from({ length: n }, (_, i) => entry(id(i), [id((i + n - 1) % n)]))
    const r = buildDependencyGraph(board(ring))
    expect(r.cycles).toHaveLength(1)
    expect(r.cycles[0]).toHaveLength(n)
    expect(performance.now() - start).toBeLessThan(1000)
  })

  it('includes stale entries and returns [] when nothing is unlanded', () => {
    expect(buildDependencyGraph(board([], [], [entry('S', ['A'])])).blockedBy.get('S')).toEqual(['A'])
    expect(buildDependencyGraph(board([entry('L')], ['L'])).criticalPath).toEqual([])
  })
})
