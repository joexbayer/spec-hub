import type { Board, BoardEntry, Owner } from '@spec-hub/core'
import { buildDependencyGraph, inferPhase, titleFromDir } from '@spec-hub/core'
import type { FeatureDetail } from '@spec-hub/server/board-query'
import type { Edge, Node } from '@xyflow/react'
import { styleDependencyEdge } from '@/features/graphs/edges'
import { CARD_H, CARD_W, dagreLayout, nodeSize } from '@/features/graphs/layout'
import { featureAriaLabel } from '@/features/graphs/nodes'

const size = () => ({ width: CARD_W, height: CARD_H })

export type Elements = { nodes: Node[]; edges: Edge[] }

function ownerOf(board: Board, userId: string): Owner {
  const m = board.members.find((x) => x.userId === userId)
  return m
    ? { kind: 'member', userId: m.userId, githubLogin: m.githubLogin, name: m.name, image: m.image }
    : { kind: 'unknown' }
}

// Person -> branch -> the version that branch holds; the version shown on the board is marked critical.
export function buildVersionElements(detail: FeatureDetail, board: Board): Elements {
  const dir = detail.entry?.dir ?? detail.landed?.dir ?? ''
  const title = detail.entry?.title ?? titleFromDir(dir)
  const nodes: Node[] = []
  const edges: Edge[] = []
  const people = new Map<string, number>()
  for (const v of detail.versions) people.set(v.carrierUserId, (people.get(v.carrierUserId) ?? 0) + 1)
  for (const [userId, count] of people) {
    nodes.push({
      id: `person:${userId}`,
      type: 'person',
      position: { x: 0, y: 0 },
      data: { owner: ownerOf(board, userId), count },
    })
  }
  for (const v of detail.versions) {
    const shown = v.branch === detail.shown?.branch
    const owner = detail.entry?.owner ?? ownerOf(board, v.carrierUserId)
    const entry: BoardEntry = {
      dir,
      number: detail.entry?.number ?? dir.match(/^\d+/)?.[0] ?? null,
      title,
      owner,
      phase: inferPhase(v),
      openClarifications: v.spec?.openClarifications ?? 0,
      dependsOn: [],
      branches: [],
      lastChangeAt: v.lastChangeAt,
      changesLandedFeature: false,
      collisions: [],
    }
    const data = { entry, blocked: false, blockedBy: [], critical: shown }
    const label = featureAriaLabel(data)
    nodes.push(
      {
        id: `branch:${v.branch}`,
        type: 'branch',
        position: { x: 0, y: 0 },
        data: { branch: v.branch, pushed: v.pushed, lastChangeAt: v.lastChangeAt },
      },
      {
        id: `version:${v.branch}`,
        type: 'feature',
        position: { x: 0, y: 0 },
        ariaLabel: shown ? `${label}, shown on the board` : label,
        data,
      },
    )
    edges.push(
      { id: `p:${v.branch}`, source: `person:${v.carrierUserId}`, target: `branch:${v.branch}` },
      { id: `v:${v.branch}`, source: `branch:${v.branch}`, target: `version:${v.branch}` },
    )
  }
  return { nodes: dagreLayout(nodes, edges, nodeSize), edges }
}

// `dir` plus `hops` levels upstream (its dependencies) and downstream (its dependents).
export function buildNeighbourhood(board: Board, dir: string, hops = 2): Elements {
  const graph = buildDependencyGraph(board)
  const keep = new Set([dir])
  const walk = (next: (e: { from: string; to: string }) => [string, string]) => {
    let frontier = [dir]
    for (let i = 0; i < hops; i++) {
      const found: string[] = []
      for (const e of graph.edges) {
        const [near, far] = next(e)
        if (frontier.includes(near) && !keep.has(far)) {
          keep.add(far)
          found.push(far)
        }
      }
      frontier = found
    }
  }
  walk((e) => [e.to, e.from])
  walk((e) => [e.from, e.to])

  const nodes: Node[] = []
  for (const id of keep) {
    const n = graph.nodes.get(id)
    if (!n) continue
    const base = { id, position: { x: 0, y: 0 } }
    if (n.kind === 'in-flight') {
      const blockedBy = graph.blockedBy.get(id) ?? []
      const data = { entry: n.entry, blocked: graph.blocked.has(id), blockedBy, critical: id === dir }
      nodes.push({ ...base, type: 'feature', ariaLabel: featureAriaLabel(data), data })
    } else if (n.kind === 'landed') {
      const landed = board.recentlyLanded.find((l) => l.dir === id) ?? {
        dir: id,
        firstSeenAt: 0,
        baseline: false,
      }
      nodes.push({ ...base, type: 'landed', ariaLabel: `${id}, landed`, data: { landed } })
    } else {
      nodes.push({ ...base, type: 'unknown', ariaLabel: `${id}, unknown feature`, data: { dir: id } })
    }
  }
  const edges: Edge[] = graph.edges
    .filter((e) => keep.has(e.from) && keep.has(e.to))
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      ...styleDependencyEdge({
        blocking: graph.blockedBy.get(e.to)?.includes(e.from) ?? false,
        inCycle: e.inCycle,
      }),
    }))
  return { nodes: dagreLayout(nodes, edges, size), edges }
}
