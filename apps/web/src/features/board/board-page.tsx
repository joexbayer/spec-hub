import { type Board, buildDependencyGraph, buildPipeline, buildWorkMap, PHASE_ORDER } from '@spec-hub/core'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Edge, Node } from '@xyflow/react'
import { AlertTriangle, Columns3, GitBranch, LayoutList, Network, Plug, User, Workflow } from 'lucide-react'
import { type ReactNode, useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { ownerName } from '@/components/person-chip'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FeatureInspector } from '@/features/dependency-map/feature-details'
import { styleDependencyEdge } from '@/features/graphs/edges'
import { GraphCanvas } from '@/features/graphs/graph-canvas'
import { dagreLayout, nodeSize, pipelineLayout } from '@/features/graphs/layout'
import { EDGE_SWATCH, GraphLegend, NODE_SWATCH } from '@/features/graphs/legend'
import { type FeatureNodeData, featureAriaLabel } from '@/features/graphs/nodes'
import { meQuery } from '@/lib/query'
import { shortAgo } from '@/lib/time'
import { type LastReportAt, useBoard } from './board-query'
import { BoardStats } from './board-stats'
import { FeatureList } from './feature-list'
import { SideRail } from './side-rail'

export type BoardView = 'list' | 'pipeline' | 'work'

const VIEW_TABS: { value: BoardView; label: string; icon: ReactNode }[] = [
  { value: 'list', label: 'List', icon: <LayoutList /> },
  { value: 'pipeline', label: 'Pipeline', icon: <Columns3 /> },
  { value: 'work', label: 'Work map', icon: <Workflow /> },
]

export function BoardPage({
  slug,
  view,
  onViewChange,
}: {
  slug: string
  view: BoardView
  onViewChange: (v: BoardView) => void
}) {
  const me = useQuery(meQuery)
  const { board: query, lastReportAt } = useBoard(slug)
  const board = query.data
  const name = me.data?.projects.find((p) => p.slug === slug)?.name ?? slug
  const blockedBy = useMemo(() => (board ? buildDependencyGraph(board).blockedBy : new Map()), [board])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="What the team is working on"
        description={
          board
            ? `${name} · ${board.inFlight.length} in flight · updated ${shortAgo(query.dataUpdatedAt)}`
            : name
        }
        actions={
          <>
            <Tabs value={view} onValueChange={(v) => onViewChange(v as BoardView)}>
              <TabsList className="h-9">
                {VIEW_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value} className="px-2.5">
                    {t.icon}
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" className="shadow-xs" asChild>
              <Link to="/p/$slug/map" params={{ slug }}>
                <Network /> Dependency map
              </Link>
            </Button>
          </>
        }
      />

      {query.isPending ? (
        <div className="space-y-4" role="status" aria-label="Loading board">
          <Skeleton className="h-32 w-full rounded-xl" />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <Skeleton className="h-96 w-full rounded-xl" />
            <Skeleton className="h-96 w-full rounded-xl" />
          </div>
        </div>
      ) : query.isError || !board ? (
        <Panel role="alert">
          <PanelBody>
            <EmptyState
              icon={AlertTriangle}
              title="Could not load the board"
              action={
                <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            >
              The hub did not answer. It retries every few seconds on its own.
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : board.inFlight.length === 0 && board.stale.length === 0 ? (
        <Panel>
          <PanelBody>
            <EmptyState
              icon={Plug}
              title="Nothing in flight yet"
              className="py-16"
              action={
                <Button asChild>
                  <Link to="/p/$slug/connect" params={{ slug }}>
                    <Plug /> Connect a clone
                  </Link>
                </Button>
              }
            >
              Connect a clone to start reporting. Features appear here as soon as the first report arrives.
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : (
        <>
          <BoardStats board={board} />
          <div className={view === 'list' ? 'grid gap-6 xl:grid-cols-[minmax(0,1fr)_21rem]' : 'space-y-6'}>
            <div className="min-w-0">
              {view === 'list' ? (
                <FeatureList
                  slug={slug}
                  inFlight={board.inFlight}
                  stale={board.stale}
                  blockedBy={blockedBy}
                />
              ) : view === 'pipeline' ? (
                <PipelineView slug={slug} board={board} />
              ) : (
                <WorkMapView slug={slug} board={board} lastReportAt={lastReportAt} />
              )}
            </div>
            <SideRail
              slug={slug}
              board={board}
              lastReportAt={lastReportAt}
              className={view === 'list' ? undefined : 'grid items-start gap-4 space-y-0 lg:grid-cols-3'}
            />
          </div>
        </>
      )}
    </div>
  )
}

const PIPELINE_ZOOM = 0.9
const GRAPH_HEIGHT = 'h-[640px] max-h-[75vh] min-h-[420px]'

function pipelineElements(board: Board): { nodes: Node[]; edges: Edge[] } {
  const graph = buildDependencyGraph(board)
  const columns = [...PHASE_ORDER, 'landed' as const]
  const landed = buildPipeline(board).columns.find((c) => c.id === 'landed')?.landed ?? []
  const columnOf = new Map<string, string>()
  const nodes = pipelineLayout(columns, board.inFlight, landed).map((n) => {
    if (n.type === 'landed') columnOf.set(n.id, 'landed')
    if (n.type !== 'feature') return n
    const entry = (n.data as FeatureNodeData).entry
    columnOf.set(n.id, entry.phase.kind)
    const data = {
      entry,
      blocked: graph.blocked.has(n.id),
      blockedBy: graph.blockedBy.get(n.id) ?? [],
    }
    return { ...n, data, ariaLabel: featureAriaLabel(data) }
  })
  const edges: Edge[] = graph.edges
    .filter((e) => {
      const from = columnOf.get(e.from)
      return from !== undefined && columnOf.has(e.to) && from !== columnOf.get(e.to)
    })
    .map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      ...styleDependencyEdge({
        blocking: graph.blockedBy.get(e.to)?.includes(e.from) ?? false,
        inCycle: e.inCycle,
      }),
    }))
  return { nodes, edges }
}

function PipelineView({ slug, board }: { slug: string; board: Board }) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const { nodes, edges } = useMemo(() => pipelineElements(board), [board])
  const node = nodes.find((n) => n.id === selected)
  const data = node?.type === 'feature' ? (node.data as FeatureNodeData) : undefined
  // Tall enough for the fullest lane at the starting zoom, plus the lane frame and some air.
  const laneHeight = Math.max(360, (nodes[0]?.height ?? 0) * PIPELINE_ZOOM + 72)
  return (
    <Panel>
      <PanelHeader
        title="Pipeline"
        count={board.inFlight.length}
        description="One lane per phase, newest change first. Scroll sideways for more lanes; double-click a card to open it."
      />
      <PanelBody className="overflow-hidden">
        <div className="relative flex max-h-[75vh]" style={{ height: laneHeight }}>
          <div className="min-w-0 flex-1">
            <GraphCanvas
              nodes={nodes}
              edges={edges}
              viewport={{ x: 28, y: 28, zoom: PIPELINE_ZOOM }}
              onSelect={setSelected}
              onOpen={(dir) => {
                if (nodes.find((n) => n.id === dir)?.type === 'feature')
                  navigate({ to: '/p/$slug/f/$dir', params: { slug, dir } })
              }}
            />
          </div>
          {data ? <FeatureInspector slug={slug} data={data} onClose={() => setSelected(null)} /> : null}
        </div>
        <GraphLegend
          items={[
            { label: 'Depends on', swatch: EDGE_SWATCH.dependency },
            { label: 'Blocking', swatch: EDGE_SWATCH.blocking },
            { label: 'Blocked feature', swatch: NODE_SWATCH.blocked },
            { label: 'Landed', swatch: NODE_SWATCH.landed },
          ]}
          hint="Edges within a lane are hidden"
        />
      </PanelBody>
    </Panel>
  )
}

function workMapElements(board: Board, lastReportAt: LastReportAt): { nodes: Node[]; edges: Edge[] } {
  const graph = buildDependencyGraph(board)
  const map = buildWorkMap(board)
  const nodes: Node[] = []
  const at = { x: 0, y: 0 }
  for (const p of map.people) {
    nodes.push({
      id: `person:${p.userId}`,
      type: 'person',
      position: at,
      ariaLabel: ownerName(p.owner),
      data: {
        owner: p.owner,
        lastReportAt: lastReportAt[p.userId],
        count: new Set(p.branchIds.flatMap((id) => map.branches.find((b) => b.id === id)?.dirs ?? [])).size,
      },
    })
  }
  for (const b of map.branches) {
    nodes.push({
      id: b.id,
      type: 'branch',
      position: at,
      ariaLabel: `Branch ${b.branch}`,
      data: { branch: b.branch, pushed: b.pushed, lastChangeAt: b.lastChangeAt },
    })
  }
  for (const entry of map.features) {
    const data = {
      entry,
      blocked: graph.blocked.has(entry.dir),
      blockedBy: graph.blockedBy.get(entry.dir) ?? [],
    }
    nodes.push({
      id: `feature:${entry.dir}`,
      type: 'feature',
      position: at,
      ariaLabel: featureAriaLabel(data),
      data,
    })
  }
  const edges: Edge[] = map.edges.map((e) => ({ id: `${e.from}->${e.to}`, source: e.from, target: e.to }))
  return { nodes: dagreLayout(nodes, edges, nodeSize), edges }
}

function WorkMapView({
  slug,
  board,
  lastReportAt,
}: {
  slug: string
  board: Board
  lastReportAt: LastReportAt
}) {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<string | null>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const base = useMemo(() => workMapElements(board, lastReportAt), [board, lastReportAt])
  const near = useMemo(() => {
    if (!hovered) return null
    const ids = new Set([hovered])
    for (const e of base.edges) {
      if (e.source === hovered) ids.add(e.target)
      if (e.target === hovered) ids.add(e.source)
    }
    return ids
  }, [base.edges, hovered])
  const nodes = useMemo(
    () =>
      near ? base.nodes.map((n) => (near.has(n.id) ? n : { ...n, style: { opacity: 0.35 } })) : base.nodes,
    [base.nodes, near],
  )
  const node = base.nodes.find((n) => n.id === selected)
  const data = node?.type === 'feature' ? (node.data as FeatureNodeData) : undefined
  return (
    <Panel>
      <PanelHeader
        title="Work map"
        description="Who carries which branch, and the feature each branch holds. Hover to trace one person's work."
      />
      <PanelBody className="overflow-hidden">
        <div className={`relative flex ${GRAPH_HEIGHT}`}>
          <div className="min-w-0 flex-1">
            {base.nodes.length === 0 ? (
              <EmptyState icon={Workflow} title="No branches yet" className="h-full">
                No branches are reporting work yet.
              </EmptyState>
            ) : (
              <GraphCanvas
                nodes={nodes}
                edges={base.edges}
                onSelect={setSelected}
                onOpen={(id) => {
                  if (id.startsWith('feature:'))
                    navigate({ to: '/p/$slug/f/$dir', params: { slug, dir: id.slice('feature:'.length) } })
                }}
                onNodeHover={setHovered}
                onlyRenderVisibleElements
              />
            )}
          </div>
          {data ? <FeatureInspector slug={slug} data={data} onClose={() => setSelected(null)} /> : null}
        </div>
        <GraphLegend
          items={[
            { label: 'Person', swatch: <User className="size-3.5" /> },
            { label: 'Branch', swatch: <GitBranch className="size-3.5" /> },
            { label: 'Feature', swatch: NODE_SWATCH.feature },
            { label: 'Not pushed', swatch: <span className="size-3 rounded-[3px] border border-dashed" /> },
          ]}
          hint="Double-click a feature to open it"
        />
      </PanelBody>
    </Panel>
  )
}
