import {
  Background,
  BackgroundVariant,
  Controls,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from 'next-themes'
import { type ReactNode, useEffect, useRef } from 'react'
import { nodeSize } from './layout'
import { nodeTypes } from './nodes'

export function GraphProvider({ children }: { children: ReactNode }) {
  return <ReactFlowProvider>{children}</ReactFlowProvider>
}

// Below this zoom card text gets too small to read, so a graph wider than the canvas starts at its
// top-left corner at this zoom instead of shrinking to fit.
const READABLE_ZOOM = 0.8
const PAD = 24

// Laid-out sizes are known up front (nodeSize), so the start view needs no measuring pass; that also
// works with onlyRenderVisibleElements, where off-screen nodes are never measured.
function InitialView({ nodes, focus }: { nodes: Node[]; focus?: string }) {
  const { setViewport } = useReactFlow()
  const width = useStore((s) => s.width)
  const height = useStore((s) => s.height)
  const done = useRef(false)
  useEffect(() => {
    if (done.current || width === 0 || height === 0 || nodes.length === 0) return
    done.current = true
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    for (const n of nodes) {
      const s = nodeSize(n)
      x0 = Math.min(x0, n.position.x)
      y0 = Math.min(y0, n.position.y)
      x1 = Math.max(x1, n.position.x + s.width)
      y1 = Math.max(y1, n.position.y + s.height)
    }
    const focusNode = focus ? nodes.find((n) => n.id === focus) : undefined
    const fit = Math.min(1, (width - 2 * PAD) / (x1 - x0), (height - 2 * PAD) / (y1 - y0))
    if (fit >= READABLE_ZOOM) {
      const x = (width - (x1 - x0) * fit) / 2 - x0 * fit
      const y = (height - (y1 - y0) * fit) / 2 - y0 * fit
      void setViewport({ x, y, zoom: fit })
    } else if (focusNode) {
      const s = nodeSize(focusNode)
      const z = READABLE_ZOOM
      const cx = focusNode.position.x + s.width / 2
      const cy = focusNode.position.y + s.height / 2
      void setViewport({ x: width / 2 - cx * z, y: height / 2 - cy * z, zoom: z })
    } else {
      void setViewport({ x: PAD - x0 * READABLE_ZOOM, y: PAD - y0 * READABLE_ZOOM, zoom: READABLE_ZOOM })
    }
  }, [nodes, focus, width, height, setViewport])
  return null
}

export function GraphCanvas({
  nodes,
  edges,
  onSelect,
  onOpen,
  onlyRenderVisibleElements,
  onNodeHover,
  viewport,
  focus,
}: {
  nodes: Node[]
  edges: Edge[]
  onSelect: (id: string) => void
  onOpen: (id: string) => void
  onlyRenderVisibleElements?: boolean
  onNodeHover?: (id: string | null) => void
  /** Start here instead of fitting everything, and pan with the scroll wheel (the pipeline's lanes). */
  viewport?: { x: number; y: number; zoom: number }
  /** When the graph is too big to fit readably, start centred on this node. */
  focus?: string
}) {
  const { resolvedTheme } = useTheme()
  return (
    // ReactFlow reuses an enclosing GraphProvider and creates its own when there is none.
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable
      defaultViewport={viewport}
      panOnScroll={!!viewport}
      minZoom={0.2}
      panOnDrag
      onlyRenderVisibleElements={onlyRenderVisibleElements}
      onNodeClick={(_, node) => onSelect(node.id)}
      onNodeDoubleClick={(_, node) => onOpen(node.id)}
      onNodeMouseEnter={onNodeHover && ((_, node) => onNodeHover(node.id))}
      onNodeMouseLeave={onNodeHover && (() => onNodeHover(null))}
    >
      {viewport ? null : <InitialView nodes={nodes} focus={focus} />}
      <Background variant={BackgroundVariant.Dots} gap={18} size={1.5} />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
