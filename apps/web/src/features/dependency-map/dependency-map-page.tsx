import { buildDependencyGraph, PHASE_ORDER, type PhaseKind } from '@spec-hub/core'
import { Link, useNavigate } from '@tanstack/react-router'
import { useReactFlow } from '@xyflow/react'
import {
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  LayoutDashboard,
  ListFilter,
  Lock,
  Route,
  SearchX,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Label, Pie, PieChart } from 'recharts'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { ownerName } from '@/components/person-chip'
import { PHASE_DOT, PhaseBadge } from '@/components/phase-badge'
import { Button } from '@/components/ui/button'
import { type ChartConfig, ChartContainer } from '@/components/ui/chart'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label as FieldLabel } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useBoard } from '@/features/board/board-query'
import { GraphCanvas, GraphProvider } from '@/features/graphs/graph-canvas'
import { InspectorPanel } from '@/features/graphs/inspector-panel'
import { CARD_H, CARD_W } from '@/features/graphs/layout'
import { EDGE_SWATCH, GraphLegend, NODE_SWATCH } from '@/features/graphs/legend'
import type { FeatureNodeData } from '@/features/graphs/nodes'
import { cn } from '@/lib/utils'
import { FeatureInspector } from './feature-details'
import { buildMapElements, DEFAULT_FILTERS, type MapFilters } from './map-elements'

const PHASE_LABEL: Record<PhaseKind, string> = {
  specify: 'Specify',
  clarify: 'Clarify',
  plan: 'Plan',
  tasks: 'Tasks',
  implement: 'Implement',
  implemented: 'Implemented',
}

export function DependencyMapPage({ slug }: { slug: string }) {
  const { board: query } = useBoard(slug)
  const board = query.data
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Dependency map"
        description="In-flight features and what they wait on. Landed dependencies are muted, unknown ones dashed."
        actions={
          <Button variant="outline" className="shadow-xs" asChild>
            <Link to="/p/$slug" params={{ slug }}>
              <LayoutDashboard /> Board
            </Link>
          </Button>
        }
      />
      {query.isPending ? (
        <Skeleton className="h-[70vh] w-full rounded-xl" role="status" aria-label="Loading board" />
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
            />
          </PanelBody>
        </Panel>
      ) : (
        <GraphProvider>
          <MapBody slug={slug} board={board} />
        </GraphProvider>
      )}
    </div>
  )
}

type LoadedBoard = NonNullable<ReturnType<typeof useBoard>['board']['data']>

function MapBody({ slug, board }: { slug: string; board: LoadedBoard }) {
  const navigate = useNavigate()
  const { setCenter } = useReactFlow()
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS)
  const [selected, setSelected] = useState<string | null>(null)
  const graph = useMemo(() => buildDependencyGraph(board), [board])
  const { nodes, edges } = useMemo(() => buildMapElements(board, filters), [board, filters])
  const selectedNode = nodes.find((n) => n.id === selected)

  const open = (dir: string) => {
    if (graph.nodes.get(dir)?.kind === 'in-flight') navigate({ to: '/p/$slug/f/$dir', params: { slug, dir } })
  }
  const focus = (dir: string) => {
    setSelected(dir)
    const n = nodes.find((x) => x.id === dir)
    if (n) setCenter(n.position.x + CARD_W / 2, n.position.y + CARD_H / 2, { zoom: 1, duration: 300 })
  }
  const togglePhase = (p: PhaseKind) =>
    setFilters((f) => ({
      ...f,
      phases: f.phases.includes(p) ? f.phases.filter((x) => x !== p) : [...f.phases, p],
    }))

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Features"
          count={nodes.filter((n) => n.type === 'feature').length}
          action={
            <>
              <Select
                value={filters.owner ?? 'all'}
                onValueChange={(v) => setFilters((f) => ({ ...f, owner: v === 'all' ? null : v }))}
              >
                <SelectTrigger size="sm" aria-label="Owner" className="h-8 w-40 bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {board.members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>
                      @{m.githubLogin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 bg-card">
                    <ListFilter />
                    Phase
                    {filters.phases.length > 0 ? (
                      <span className="rounded bg-muted px-1 text-xs tabular-nums">
                        {filters.phases.length}
                      </span>
                    ) : null}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Show phases
                  </DropdownMenuLabel>
                  {PHASE_ORDER.map((p) => (
                    <DropdownMenuCheckboxItem
                      key={p}
                      checked={filters.phases.includes(p)}
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => togglePhase(p)}
                    >
                      <span aria-hidden className={`size-2 rounded-full ${PHASE_DOT[p]}`} />
                      {PHASE_LABEL[p]}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <FieldLabel className="h-8 gap-2 rounded-md border bg-card px-2.5 text-sm font-normal shadow-xs">
                <Switch
                  size="sm"
                  checked={filters.showLanded}
                  onCheckedChange={(on) => setFilters((f) => ({ ...f, showLanded: on }))}
                />
                Show landed
              </FieldLabel>
              <FieldLabel className="h-8 gap-2 rounded-md border bg-card px-2.5 text-sm font-normal shadow-xs">
                <Switch
                  size="sm"
                  checked={filters.showStale}
                  onCheckedChange={(on) => setFilters((f) => ({ ...f, showStale: on }))}
                />
                Show stale
              </FieldLabel>
            </>
          }
        />
        <PanelBody className="overflow-hidden">
          <div className="relative flex h-[70vh] min-h-[28rem]">
            <div className="min-w-0 flex-1">
              {nodes.length === 0 ? (
                <EmptyState icon={SearchX} title="No features match these filters" className="h-full">
                  Pick another owner or phase, or show landed and stale features.
                </EmptyState>
              ) : (
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  onSelect={setSelected}
                  onOpen={open}
                  onlyRenderVisibleElements
                />
              )}
            </div>
            {selectedNode ? (
              selectedNode.type === 'feature' ? (
                <FeatureInspector
                  slug={slug}
                  data={selectedNode.data as FeatureNodeData}
                  onClose={() => setSelected(null)}
                />
              ) : (
                <InspectorPanel
                  title={selectedNode.id}
                  icon={selectedNode.type === 'landed' ? <CheckCircle2 /> : <HelpCircle />}
                  onClose={() => setSelected(null)}
                >
                  <p className="p-4 text-sm text-muted-foreground">
                    {selectedNode.type === 'landed' ? 'Landed on the default branch.' : 'Not on the board.'}
                  </p>
                </InspectorPanel>
              )
            ) : null}
          </div>
          <GraphLegend
            items={[
              { label: 'Depends on', swatch: EDGE_SWATCH.dependency },
              { label: 'Blocking', swatch: EDGE_SWATCH.blocking },
              { label: 'Critical path', swatch: EDGE_SWATCH.critical },
              { label: 'On the critical path', swatch: NODE_SWATCH.focus },
              { label: 'Landed', swatch: NODE_SWATCH.landed },
              { label: 'Unknown', swatch: NODE_SWATCH.unknown },
            ]}
            hint="Double-click a feature to open it"
          />
        </PanelBody>
      </Panel>

      <aside className="grid items-start gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <PhaseHealth board={board} blocked={graph.blocked.size} />
        <Panel>
          <PanelHeader
            title="Critical path"
            count={graph.criticalPath.length}
            description="Dependency first"
          />
          <PanelBody>
            {graph.criticalPath.length === 0 ? (
              <EmptyState icon={Route} title="No critical path">
                No unfinished dependency chain.
              </EmptyState>
            ) : (
              <ol className="px-4 py-3">
                {graph.criticalPath.map((dir, i) => {
                  const state = graph.nodes.get(dir)
                  const last = i === graph.criticalPath.length - 1
                  return (
                    <li key={dir} className="relative flex gap-3 pb-4 last:pb-0">
                      {last ? null : (
                        <span aria-hidden className="absolute top-4 bottom-0 left-[4.5px] w-px bg-border" />
                      )}
                      <span
                        aria-hidden
                        className={cn(
                          'relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-card',
                          state?.kind === 'in-flight'
                            ? PHASE_DOT[state.entry.phase.kind]
                            : state?.kind === 'landed'
                              ? 'bg-phase-landed'
                              : 'bg-state-unknown',
                        )}
                      />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => focus(dir)}>
                        <span className="block truncate text-sm font-medium hover:underline">
                          {state?.kind === 'in-flight' ? state.entry.title : dir}
                        </span>
                        {state?.kind === 'in-flight' ? (
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <PhaseBadge phase={state.entry.phase} />
                            {ownerName(state.entry.owner)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {state?.kind === 'landed' ? 'Landed' : 'Unknown feature'}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}
          </PanelBody>
        </Panel>
        {graph.cycles.length > 0 ? (
          <Panel role="alert" className="border-state-blocked/40">
            <PanelHeader
              icon={<AlertTriangle className="text-state-blocked" />}
              title="Dependency cycles"
              count={graph.cycles.length}
              description="These features wait on each other; none of them can finish first."
            />
            <PanelBody className="space-y-1 px-4 py-3 font-mono text-xs">
              {graph.cycles.map((c) => (
                <p key={c.join('|')}>{c.join(' → ')}</p>
              ))}
            </PanelBody>
          </Panel>
        ) : null}
      </aside>
    </div>
  )
}

const chartConfig = Object.fromEntries(
  PHASE_ORDER.map((p) => [p, { label: PHASE_LABEL[p], color: `var(--phase-${p})` }]),
) satisfies ChartConfig

function PhaseHealth({ board, blocked }: { board: LoadedBoard; blocked: number }) {
  const total = board.inFlight.length
  const data = PHASE_ORDER.map((p) => ({
    phase: p,
    count: board.inFlight.filter((e) => e.phase.kind === p).length,
    fill: `var(--color-${p})`,
  }))
  return (
    <Panel>
      <PanelHeader title="Phase health" description={`${total} in flight, ${blocked} blocked`} />
      <PanelBody className="flex items-center gap-4 p-4">
        <ChartContainer config={chartConfig} className="aspect-square h-32 shrink-0">
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="phase"
              innerRadius={42}
              outerRadius={60}
              strokeWidth={2}
              stroke="var(--card)"
              isAnimationActive={false}
            >
              <Label
                content={({ viewBox }) =>
                  viewBox && 'cx' in viewBox ? (
                    <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                      <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-2xl font-semibold">
                        {total}
                      </tspan>
                      <tspan
                        x={viewBox.cx}
                        y={(viewBox.cy ?? 0) + 20}
                        className="fill-muted-foreground text-xs"
                      >
                        in flight
                      </tspan>
                    </text>
                  ) : null
                }
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="min-w-0 flex-1 space-y-1 text-sm">
          {data.map((d) => (
            <li key={d.phase} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span aria-hidden className="size-2 rounded-full" style={{ background: d.fill }} />
                {PHASE_LABEL[d.phase]}
              </span>
              <span className="tabular-nums">{d.count}</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-2 border-t pt-1 text-state-blocked">
            <span className="flex items-center gap-2">
              <Lock aria-hidden className="size-3" />
              Blocked
            </span>
            <span className="tabular-nums">{blocked}</span>
          </li>
        </ul>
      </PanelBody>
    </Panel>
  )
}
