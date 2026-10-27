// Accessible names live on the React Flow node objects (`ariaLabel`), which xyflow puts on its
// focusable node wrapper; see featureAriaLabel and the layout helpers.
import type { BoardEntry, LandedFeature, Owner } from '@spec-hub/core'
import { phaseLabel, titleFromDir } from '@spec-hub/core'
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle2, Cloud, CloudOff, GitBranch } from 'lucide-react'
import { FeatureCard } from '@/components/feature-card'
import { OwnerAvatar, ownerName } from '@/components/person-chip'
import { PHASE_DOT } from '@/components/phase-badge'
import { shortAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import type { PipelineColumn } from './layout'

export type FeatureNodeData = {
  entry: BoardEntry
  blocked: boolean
  blockedBy: string[]
  critical?: boolean
  dimmed?: boolean
}

function Handles() {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </>
  )
}

export function featureAriaLabel(d: FeatureNodeData): string {
  const { entry } = d
  const parts = [`${entry.number ?? ''} ${entry.title}`.trim(), phaseLabel(entry.phase)]
  if (entry.phase.kind === 'implement') parts[1] = `Implement ${entry.phase.done} of ${entry.phase.total}`
  if (d.blocked) parts.push(d.blockedBy.length ? `blocked by ${d.blockedBy.join(', ')}` : 'blocked')
  return parts.join(', ')
}

export function FeatureNode({ data, selected }: NodeProps<Node<FeatureNodeData>>) {
  return (
    <div
      className={cn(
        'w-[260px] rounded-lg',
        data.critical && 'shadow-md ring-2 ring-foreground/35',
        data.dimmed && 'opacity-40',
      )}
    >
      <Handles />
      <FeatureCard
        entry={data.entry}
        blocked={data.blocked}
        blockedBy={data.blockedBy}
        size="compact"
        selected={selected}
      />
    </div>
  )
}

export function LandedNode({ data, selected }: NodeProps<Node<{ landed: LandedFeature; dimmed?: boolean }>>) {
  const number = data.landed.dir.match(/^\d+/)?.[0]
  const title = titleFromDir(data.landed.dir)
  return (
    <div
      className={cn(
        'flex h-[52px] w-[260px] items-center gap-2.5 rounded-lg border bg-panel px-3 text-muted-foreground',
        selected && 'ring-2 ring-ring/60',
        data.dimmed && 'opacity-40',
      )}
    >
      <Handles />
      <CheckCircle2 aria-label="Landed" className="size-4 shrink-0 text-phase-landed" />
      <span className="shrink-0 font-mono text-xs">{number ?? '—'}</span>
      <span className="min-w-0 truncate text-sm" title={title}>
        {title}
      </span>
    </div>
  )
}

export function UnknownNode({ data, selected }: NodeProps<Node<{ dir: string }>>) {
  return (
    <div
      className={cn(
        'flex h-[52px] w-[260px] flex-col justify-center rounded-lg border border-dashed border-state-unknown/70 px-3 text-muted-foreground',
        selected && 'ring-2 ring-ring/60',
      )}
      title="Not on the board or the default branch"
    >
      <Handles />
      <span className="truncate font-mono text-xs">{data.dir}</span>
      <span className="text-xs">Unknown feature</span>
    </div>
  )
}

export type ColumnNodeData = { label: string; kind: PipelineColumn; count: number; height: number }

const COLUMN_DOT: Record<PipelineColumn, string> = { ...PHASE_DOT, landed: 'bg-phase-landed' }

// A pipeline lane: header with the phase dot and count, and a muted lane behind the column's cards.
export function ColumnNode({ data }: NodeProps<Node<ColumnNodeData>>) {
  return (
    <div className="relative w-[260px]" style={{ height: data.height }}>
      <div className="absolute -inset-3 rounded-xl border bg-panel" />
      <div className="relative flex h-9 items-center gap-2 px-1 text-sm font-medium">
        <span aria-hidden className={cn('size-2 rounded-full', COLUMN_DOT[data.kind])} />
        {data.label}
        <span className="rounded-md bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
          {data.count}
        </span>
      </div>
      {data.count === 0 ? (
        <div className="relative mt-6 grid h-20 place-items-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Nothing here
        </div>
      ) : null}
    </div>
  )
}

export function PersonNode({
  data,
  selected,
}: NodeProps<Node<{ owner: Owner; lastReportAt?: number; count: number }>>) {
  return (
    <div
      className={cn(
        'flex h-16 w-[220px] items-center gap-3 rounded-lg border bg-card px-3 shadow-xs',
        selected && 'ring-2 ring-ring/60',
      )}
    >
      <Handles />
      <OwnerAvatar owner={data.owner} size="default" />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-medium">{ownerName(data.owner)}</div>
        <div className="truncate text-xs text-muted-foreground">
          {data.lastReportAt !== undefined
            ? `reported ${formatDistanceToNow(data.lastReportAt, { addSuffix: true })}`
            : `${data.count} ${data.count === 1 ? 'feature' : 'features'}`}
        </div>
      </div>
      <span className="rounded-md bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
        {data.count}
      </span>
    </div>
  )
}

export function BranchNode({
  data,
  selected,
}: NodeProps<Node<{ branch: string; pushed: boolean; lastChangeAt: number }>>) {
  return (
    <div
      className={cn(
        'flex h-16 w-[220px] flex-col justify-center gap-1 rounded-lg border bg-card px-3 shadow-xs',
        !data.pushed && 'border-dashed',
        selected && 'ring-2 ring-ring/60',
      )}
    >
      <Handles />
      <div className="flex items-center gap-1.5">
        <GitBranch aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate font-mono text-xs" title={data.branch}>
          {data.branch}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
        {data.pushed ? (
          <span className="inline-flex items-center gap-1">
            <Cloud aria-hidden className="size-3" /> Pushed
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <CloudOff aria-hidden className="size-3" /> Local
          </span>
        )}
        <span aria-hidden>·</span>
        <span className="truncate">{shortAgo(data.lastChangeAt)}</span>
      </div>
    </div>
  )
}

// Module-level so React Flow sees a stable reference.
export const nodeTypes = {
  feature: FeatureNode,
  landed: LandedNode,
  unknown: UnknownNode,
  column: ColumnNode,
  person: PersonNode,
  branch: BranchNode,
}
