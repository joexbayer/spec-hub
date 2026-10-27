import dagre from '@dagrejs/dagre'
import type { BoardEntry, LandedFeature, PhaseKind } from '@spec-hub/core'
import type { Edge, Node } from '@xyflow/react'
import { featureAriaLabel } from './nodes'

export const CARD_W = 260
export const CARD_H = 112
/** Landed and unknown dependencies: one-line leaf cards. */
export const LEAF_H = 52
export const GAP = 24
export const HEADER_H = 48

export type PipelineColumn = PhaseKind | 'landed'

export function dagreLayout(
  nodes: Node[],
  edges: Edge[],
  size: (n: Node) => { width: number; height: number },
): Node[] {
  const g = new dagre.graphlib.Graph()
    .setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 96 })
    .setDefaultEdgeLabel(() => ({}))
  for (const n of nodes) g.setNode(n.id, size(n))
  for (const e of edges) g.setEdge(e.source, e.target)
  dagre.layout(g)
  return nodes.map((n) => {
    const p = g.node(n.id)
    const s = size(n)
    return { ...n, position: { x: p.x - s.width / 2, y: p.y - s.height / 2 } }
  })
}

const COLUMN_LABELS: Record<PipelineColumn, string> = {
  specify: 'Specify',
  clarify: 'Clarify',
  plan: 'Plan',
  tasks: 'Tasks',
  implement: 'Implement',
  implemented: 'Implemented',
  landed: 'Recently landed',
}

// Lanes sit a column gap apart, wider than GAP so each lane's frame has room around its cards.
const COLUMN_GAP = 48

export function nodeSize(n: Node): { width: number; height: number } {
  if (n.type === 'person' || n.type === 'branch') return { width: 220, height: 64 }
  if (n.type === 'landed' || n.type === 'unknown') return { width: CARD_W, height: LEAF_H }
  return { width: CARD_W, height: CARD_H }
}

// Fixed columns: one lane per column, cards stacked in the order given (caller passes newest first).
export function pipelineLayout(
  columns: readonly PipelineColumn[],
  entries: BoardEntry[],
  recentlyLanded: LandedFeature[],
): Node[] {
  const cards: Node[] = []
  const colX = (i: number) => i * (CARD_W + COLUMN_GAP)
  const next = new Map<PipelineColumn, number>(columns.map((c) => [c, HEADER_H + GAP]))
  const count = new Map<PipelineColumn, number>()
  const place = (col: PipelineColumn, node: Omit<Node, 'position'>) => {
    const i = columns.indexOf(col)
    if (i < 0) return
    const y = next.get(col) ?? HEADER_H + GAP
    const h = node.type === 'landed' ? LEAF_H : CARD_H
    next.set(col, y + h + GAP)
    count.set(col, (count.get(col) ?? 0) + 1)
    cards.push({ ...node, position: { x: colX(i), y }, width: CARD_W, height: h })
  }
  for (const entry of entries) {
    place(entry.phase.kind, {
      id: entry.dir,
      type: 'feature',
      ariaLabel: featureAriaLabel({ entry, blocked: false, blockedBy: [] }),
      data: { entry, blocked: false, blockedBy: [] },
    })
  }
  for (const landed of recentlyLanded) {
    place('landed', { id: landed.dir, type: 'landed', ariaLabel: `${landed.dir}, landed`, data: { landed } })
  }
  // Every lane is as tall as the fullest one, so the board reads as one grid.
  const height = Math.max(HEADER_H + GAP + CARD_H, ...next.values()) - GAP
  const lanes: Node[] = columns.map((c, i) => ({
    id: `col-${c}`,
    type: 'column',
    position: { x: colX(i), y: 0 },
    data: { label: COLUMN_LABELS[c], kind: c, count: count.get(c) ?? 0, height },
    selectable: false,
    draggable: false,
    focusable: false,
    width: CARD_W,
    height,
  }))
  // Lanes first, so the cards render on top of them.
  return [...lanes, ...cards]
}
