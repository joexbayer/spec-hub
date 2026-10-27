import { buildDependencyGraph, phaseLabel } from '@spec-hub/core'
import type { FeatureDetail } from '@spec-hub/server/board-query'
import { useNavigate } from '@tanstack/react-router'
import { GitBranch, User } from 'lucide-react'
import { useMemo } from 'react'
import { useBoard } from '@/features/board/board-query'
import { GraphCanvas } from '@/features/graphs/graph-canvas'
import { EDGE_SWATCH, GraphLegend, NODE_SWATCH } from '@/features/graphs/legend'
import { buildNeighbourhood, buildVersionElements } from './graph-elements'

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border bg-card px-5 py-10 text-center text-sm text-muted-foreground">
      {children}
    </p>
  )
}

function Side({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function useBoardData(slug: string) {
  const { board } = useBoard(slug)
  return board
}

export function VersionsPanel({ slug, detail }: { slug: string; detail: FeatureDetail }) {
  const board = useBoardData(slug)
  const elements = useMemo(
    () => (board.data ? buildVersionElements(detail, board.data) : null),
    [detail, board.data],
  )
  if (board.error) return <Note>Could not load the board: {board.error.message}</Note>
  if (!elements) return <Note>Loading…</Note>
  if (detail.versions.length === 0) return <Note>No branch carries this feature.</Note>
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="h-[28rem]">
          <GraphCanvas nodes={elements.nodes} edges={elements.edges} onSelect={() => {}} onOpen={() => {}} />
        </div>
        <div className="space-y-4 border-t p-4 lg:border-t-0 lg:border-l">
          <Side title="Branches">
            <ul className="space-y-2 text-sm">
              {detail.versions.map((v) => (
                <li key={v.branch} className="flex items-start gap-2">
                  <GitBranch aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs break-all">{v.branch}</span>
                    {v.branch === detail.shown?.branch ? (
                      <span className="text-xs text-muted-foreground">(shown on the board)</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </Side>
        </div>
      </div>
      <GraphLegend
        items={[
          { label: 'Person', swatch: <User className="size-3.5" /> },
          { label: 'Branch', swatch: <GitBranch className="size-3.5" /> },
          { label: 'Shown on the board', swatch: NODE_SWATCH.focus },
        ]}
      />
    </div>
  )
}

export function DependenciesPanel({ slug, dir }: { slug: string; dir: string }) {
  const navigate = useNavigate()
  const board = useBoardData(slug)
  const data = useMemo(() => {
    if (!board.data) return null
    const graph = buildDependencyGraph(board.data)
    const label = (d: string) => {
      const n = graph.nodes.get(d)
      return n?.kind === 'in-flight'
        ? `${d} (${phaseLabel(n.entry.phase)})`
        : `${d} (${n?.kind ?? 'unknown'})`
    }
    return {
      elements: buildNeighbourhood(board.data, dir),
      dependsOn: graph.edges.filter((e) => e.to === dir).map((e) => label(e.from)),
      blocks: graph.edges.filter((e) => e.from === dir).map((e) => label(e.to)),
    }
  }, [board.data, dir])
  if (board.error) return <Note>Could not load the board: {board.error.message}</Note>
  if (!data) return <Note>Loading…</Note>
  if (data.dependsOn.length === 0 && data.blocks.length === 0) {
    return (
      <Note>No dependencies declared. Add a `**Depends on**:` line with links to other features' specs.</Note>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="h-[28rem]">
          <GraphCanvas
            nodes={data.elements.nodes}
            edges={data.elements.edges}
            focus={dir}
            onSelect={() => {}}
            onOpen={(id) => {
              if (id !== dir) navigate({ to: '/p/$slug/f/$dir', params: { slug, dir: id } })
            }}
          />
        </div>
        <div className="space-y-4 border-t p-4 text-sm lg:border-t-0 lg:border-l">
          <Side title="Depends on">
            <DirList items={data.dependsOn} />
          </Side>
          <Side title="Blocks">
            <DirList items={data.blocks} />
          </Side>
        </div>
      </div>
      <GraphLegend
        items={[
          { label: 'Depends on', swatch: EDGE_SWATCH.dependency },
          { label: 'Blocking', swatch: EDGE_SWATCH.blocking },
          { label: 'This feature', swatch: NODE_SWATCH.focus },
          { label: 'Landed', swatch: NODE_SWATCH.landed },
        ]}
        hint="Double-click a feature to open it"
      />
    </div>
  )
}

function DirList({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">nothing</p>
  return (
    <ul className="space-y-1">
      {items.map((d) => (
        <li key={d} className="text-sm break-words">
          {d}
        </li>
      ))}
    </ul>
  )
}
