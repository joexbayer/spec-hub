// Graph builders over a Board (FR-037). Pure, no I/O.
import { PHASE_ORDER } from './phase.ts'
import type { Board, BoardEntry, LandedFeature, Owner, PhaseKind } from './types.ts'

export type DepNodeState =
  | { kind: 'in-flight'; entry: BoardEntry }
  | { kind: 'landed'; dir: string }
  | { kind: 'unknown'; dir: string }

export interface DepEdge {
  from: string
  to: string
  inCycle: boolean
}

export interface DepGraph {
  nodes: Map<string, DepNodeState>
  /** from = dependency, to = dependent. De-duplicated. */
  edges: DepEdge[]
  /** Dirs of entries with at least one not-yet-landed dependency. */
  blocked: Set<string>
  /** Blocked entry dir -> its not-yet-landed dependency dirs (sorted). Only blocked entries appear. */
  blockedBy: Map<string, string[]>
  /** Longest chain (two or more) of not-yet-landed nodes, dependency first; [] when there is none. */
  criticalPath: string[]
  /** Strongly connected components with more than one node; each sorted, list sorted by first element. */
  cycles: string[][]
}

interface RawEdge {
  from: string
  to: string
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function buildDependencyGraph(board: Board): DepGraph {
  const entries = [...board.inFlight, ...board.stale]
  const landed = new Set(board.landedDirs)
  const isUnlanded = (dir: string) => !landed.has(dir)

  const nodes = new Map<string, DepNodeState>(entries.map((e) => [e.dir, { kind: 'in-flight', entry: e }]))

  const seen = new Set<string>()
  const raw: RawEdge[] = []
  for (const e of entries) {
    for (const d of e.dependsOn) {
      if (d === e.dir || d === '.') continue
      const key = `${d}\u0000${e.dir}`
      if (seen.has(key)) continue
      seen.add(key)
      raw.push({ from: d, to: e.dir })
    }
  }
  for (const { from } of raw) {
    if (!nodes.has(from))
      nodes.set(from, landed.has(from) ? { kind: 'landed', dir: from } : { kind: 'unknown', dir: from })
  }

  const cycles = stronglyConnected(nodes.keys(), raw)
    .filter((c) => c.length > 1)
    .map((c) => [...c].sort(byString))
    .sort((a, b) => byString(a[0] ?? '', b[0] ?? ''))
  const cycleOf = new Map<string, number>()
  cycles.forEach((c, i) => {
    for (const id of c) cycleOf.set(id, i)
  })
  const edges: DepEdge[] = raw.map(({ from, to }) => {
    const cf = cycleOf.get(from)
    return { from, to, inCycle: cf !== undefined && cf === cycleOf.get(to) }
  })

  const blocked = new Set<string>()
  const blockedBy = new Map<string, string[]>()
  const depsOf = new Map<string, Set<string>>()
  for (const { from, to } of raw) {
    if (!isUnlanded(from)) continue
    const set = depsOf.get(to) ?? new Set<string>()
    set.add(from)
    depsOf.set(to, set)
  }
  for (const [dir, deps] of depsOf) {
    blocked.add(dir)
    blockedBy.set(dir, [...deps].sort(byString))
  }

  const criticalPath = longestUnlandedChain(nodes, edges, isUnlanded)

  return { nodes, edges, blocked, blockedBy, criticalPath, cycles }
}

/** Element-wise lexicographic comparison; equivalent to comparing paths joined with a NUL separator. */
function comparePaths(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const c = byString(a[i] ?? '', b[i] ?? '')
    if (c !== 0) return c
  }
  return a.length - b.length
}

function longestUnlandedChain(
  nodes: Map<string, DepNodeState>,
  edges: DepEdge[],
  isUnlanded: (dir: string) => boolean,
): string[] {
  const ids = [...nodes.keys()].filter(isUnlanded)
  if (ids.length === 0) return []

  // Usable edges: not in a cycle and both ends unlanded. Removing intra-SCC edges leaves a DAG.
  const out = new Map<string, string[]>(ids.map((id) => [id, []]))
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const { from, to, inCycle } of edges) {
    if (inCycle || !isUnlanded(from) || !isUnlanded(to)) continue
    out.get(from)?.push(to)
    indegree.set(to, (indegree.get(to) ?? 0) + 1)
  }

  // Best (longest, then lexicographically smallest) path ending at each node, in topological order.
  const best = new Map<string, string[]>(ids.map((id) => [id, [id]]))
  const queue = ids.filter((id) => indegree.get(id) === 0)
  for (let head = 0; head < queue.length; head++) {
    const u = queue[head]
    if (u === undefined) break
    const pu = best.get(u) ?? [u]
    for (const v of out.get(u) ?? []) {
      const candidate = [...pu, v]
      const current = best.get(v) ?? [v]
      if (
        candidate.length > current.length ||
        (candidate.length === current.length && comparePaths(candidate, current) < 0)
      ) {
        best.set(v, candidate)
      }
      const left = (indegree.get(v) ?? 0) - 1
      indegree.set(v, left)
      if (left === 0) queue.push(v)
    }
  }

  // Unknown nodes have no timestamp and count as oldest.
  const lastChange = (id: string): number => {
    const state = nodes.get(id)
    return state?.kind === 'in-flight' ? state.entry.lastChangeAt : Number.NEGATIVE_INFINITY
  }
  let winner: string[] = []
  for (const path of best.values()) {
    if (winner.length === 0 || path.length > winner.length) {
      winner = path
      continue
    }
    if (path.length < winner.length) continue
    const a = lastChange(path[path.length - 1] ?? '')
    const b = lastChange(winner[winner.length - 1] ?? '')
    if (a < b || (a === b && comparePaths(path, winner) < 0)) winner = path
  }
  return winner.length >= 2 ? winner : []
}

/** Tarjan's strongly connected components, iterative (explicit stack, no recursion). */
function stronglyConnected(ids: Iterable<string>, edges: RawEdge[]): string[][] {
  const adj = new Map<string, string[]>()
  for (const id of ids) adj.set(id, [])
  for (const { from, to } of edges) {
    if (!adj.has(to)) adj.set(to, [])
    const list = adj.get(from)
    if (list) list.push(to)
    else adj.set(from, [to])
  }

  const index = new Map<string, number>()
  const low = new Map<string, number>()
  const onStack = new Set<string>()
  const stack: string[] = []
  const result: string[][] = []
  let counter = 0

  const visit = (id: string) => {
    index.set(id, counter)
    low.set(id, counter)
    counter++
    stack.push(id)
    onStack.add(id)
  }

  for (const root of adj.keys()) {
    if (index.has(root)) continue
    visit(root)
    const work: { node: string; next: number }[] = [{ node: root, next: 0 }]
    while (work.length > 0) {
      const frame = work[work.length - 1]
      if (frame === undefined) break
      const succ = adj.get(frame.node) ?? []
      const w = succ[frame.next]
      if (w !== undefined) {
        frame.next++
        if (!index.has(w)) {
          visit(w)
          work.push({ node: w, next: 0 })
        } else if (onStack.has(w)) {
          low.set(frame.node, Math.min(low.get(frame.node) ?? 0, index.get(w) ?? 0))
        }
        continue
      }
      work.pop()
      const nodeLow = low.get(frame.node) ?? 0
      if (nodeLow === index.get(frame.node)) {
        const component: string[] = []
        for (;;) {
          const top = stack.pop()
          if (top === undefined) break
          onStack.delete(top)
          component.push(top)
          if (top === frame.node) break
        }
        result.push(component)
      }
      const parent = work[work.length - 1]
      if (parent) low.set(parent.node, Math.min(low.get(parent.node) ?? 0, nodeLow))
    }
  }
  return result
}

export type PipelineColumn = PhaseKind | 'landed'
export interface Pipeline {
  columns: { id: PipelineColumn; entries: BoardEntry[]; landed: LandedFeature[] }[]
}

export function buildPipeline(board: Board): Pipeline {
  const columns: Pipeline['columns'] = PHASE_ORDER.map((id) => ({
    id,
    entries: board.inFlight.filter((e) => e.phase.kind === id),
    landed: [],
  }))
  columns.push({ id: 'landed', entries: [], landed: board.recentlyLanded })
  return { columns }
}

export interface WorkMap {
  people: { userId: string; owner: Owner; branchIds: string[] }[]
  branches: {
    id: string
    userId: string
    branch: string
    pushed: boolean
    lastChangeAt: number
    dirs: string[]
  }[]
  features: BoardEntry[]
  edges: { from: string; to: string }[]
}

export function buildWorkMap(board: Board): WorkMap {
  const branches = new Map<string, WorkMap['branches'][number]>()
  const edges: WorkMap['edges'] = []
  for (const e of board.inFlight) {
    for (const ref of e.branches) {
      const id = `branch:${ref.carrierUserId}:${ref.branch}`
      let b = branches.get(id)
      if (!b) {
        b = {
          id,
          userId: ref.carrierUserId,
          branch: ref.branch,
          pushed: true,
          lastChangeAt: ref.lastChangeAt,
          dirs: [],
        }
        branches.set(id, b)
      }
      b.pushed = b.pushed && ref.pushed
      b.lastChangeAt = Math.max(b.lastChangeAt, ref.lastChangeAt)
      if (!b.dirs.includes(e.dir)) {
        b.dirs.push(e.dir)
        edges.push({ from: id, to: `feature:${e.dir}` })
      }
    }
  }

  const branchList = [...branches.values()].sort(
    (a, b) => byString(a.branch, b.branch) || byString(a.userId, b.userId),
  )
  for (const b of branchList) b.dirs.sort(byString)

  const people = new Map<string, WorkMap['people'][number]>()
  for (const b of branchList) {
    let p = people.get(b.userId)
    if (!p) {
      const m = board.members.find((x) => x.userId === b.userId)
      const owner: Owner = m
        ? { kind: 'member', userId: m.userId, githubLogin: m.githubLogin, name: m.name, image: m.image }
        : { kind: 'unknown' }
      p = { userId: b.userId, owner, branchIds: [] }
      people.set(b.userId, p)
    }
    edges.push({ from: `person:${b.userId}`, to: b.id })
    p.branchIds.push(b.id)
  }
  const login = (p: WorkMap['people'][number]) => (p.owner.kind === 'member' ? p.owner.githubLogin : p.userId)
  return {
    people: [...people.values()].sort((a, b) => byString(login(a), login(b)) || byString(a.userId, b.userId)),
    branches: branchList,
    features: [...board.inFlight],
    edges,
  }
}
