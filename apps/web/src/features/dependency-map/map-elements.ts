import { type Board, type BoardEntry, buildDependencyGraph, type PhaseKind } from '@spec-hub/core'
import type { Edge, Node } from '@xyflow/react'
import { styleDependencyEdge } from '@/features/graphs/edges'
import { dagreLayout, nodeSize } from '@/features/graphs/layout'
import { featureAriaLabel } from '@/features/graphs/nodes'

export interface MapFilters {
  /** Member userId, or null for everyone. */
  owner: string | null
  /** Empty means every phase. */
  phases: PhaseKind[]
  showLanded: boolean
  showStale: boolean
}

export const DEFAULT_FILTERS: MapFilters = { owner: null, phases: [], showLanded: true, showStale: false }

const ownedBy = (e: BoardEntry, userId: string) => e.owner.kind === 'member' && e.owner.userId === userId

// Nodes and edges of the dependency map, laid out left to right. Filters remove nodes and their edges;
// stale entries are hidden unless asked for; landed and unknown nodes only appear as dependencies of a
// visible in-flight node, so those reachable only from hidden stale entries disappear with them.
export function buildMapElements(board: Board, filters: MapFilters): { nodes: Node[]; edges: Edge[] } {
  const graph = buildDependencyGraph(board)
  const critical = new Set(graph.criticalPath)
  const criticalEdges = new Set(
    graph.criticalPath.slice(1).map((to, i) => `${graph.criticalPath[i]}\u0000${to}`),
  )

  const stale = new Set(board.stale.map((e) => e.dir))
  const visible = new Set<string>()
  for (const [dir, state] of graph.nodes) {
    if (state.kind !== 'in-flight') continue
    const e = state.entry
    if (!filters.showStale && stale.has(dir)) continue
    if (filters.owner !== null && !ownedBy(e, filters.owner)) continue
    if (filters.phases.length > 0 && !filters.phases.includes(e.phase.kind)) continue
    visible.add(dir)
  }
  for (const { from, to } of graph.edges) {
    const state = graph.nodes.get(from)
    if (!state || state.kind === 'in-flight' || !visible.has(to)) continue
    if (state.kind === 'landed' && !filters.showLanded) continue
    visible.add(from)
  }

  const nodes: Node[] = []
  for (const dir of visible) {
    const state = graph.nodes.get(dir)
    if (!state) continue
    const base = { id: dir, position: { x: 0, y: 0 } }
    if (state.kind === 'in-flight') {
      const data = {
        entry: state.entry,
        blocked: graph.blocked.has(dir),
        blockedBy: graph.blockedBy.get(dir) ?? [],
        critical: critical.has(dir),
      }
      nodes.push({ ...base, type: 'feature', ariaLabel: featureAriaLabel(data), data })
    } else if (state.kind === 'landed') {
      nodes.push({
        ...base,
        type: 'landed',
        ariaLabel: `${dir}, landed`,
        data: { landed: { dir, firstSeenAt: 0, baseline: false } },
      })
    } else {
      nodes.push({ ...base, type: 'unknown', ariaLabel: `Unknown feature ${dir}`, data: { dir } })
    }
  }

  const edges: Edge[] = graph.edges
    .filter((e) => visible.has(e.from) && visible.has(e.to))
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      ...styleDependencyEdge({
        blocking: graph.blockedBy.get(e.to)?.includes(e.from) ?? false,
        critical: criticalEdges.has(`${e.from}\u0000${e.to}`),
        inCycle: e.inCycle,
      }),
    }))

  return { nodes: dagreLayout(nodes, edges, nodeSize), edges }
}
