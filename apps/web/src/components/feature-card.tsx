import type { BoardEntry } from '@spec-hub/core'
import { AlertTriangle, CloudOff, GitMerge, HelpCircle, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { shortAgo } from '@/lib/time'
import { cn } from '@/lib/utils'
import { OwnerAvatar, ownerName, PersonChip } from './person-chip'
import { PhaseBadge } from './phase-badge'

export function StateBadge({
  icon,
  text,
  className,
  tip,
}: {
  icon: ReactNode
  text: string
  className?: string
  tip?: string
}) {
  const badge = (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-md border bg-background px-1.5 text-xs whitespace-nowrap [&_svg]:size-3',
        className,
      )}
      tabIndex={tip ? 0 : undefined}
    >
      {icon}
      {text}
    </span>
  )
  if (!tip) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  )
}

export function progressOf(entry: BoardEntry): { done: number; total: number } | null {
  const p = entry.phase
  if (p.kind === 'implement') return { done: p.done, total: p.total }
  if (p.kind === 'implemented') return { done: p.total, total: p.total }
  if (p.kind === 'tasks') return { done: 0, total: p.total }
  return null
}

export function isNotPushed(entry: BoardEntry): boolean {
  return entry.branches.length > 0 && entry.branches.every((b) => !b.pushed)
}

// The state badges every feature can carry; each has text and an icon, never colour alone.
export function FeatureStateBadges({
  entry,
  blocked,
  blockedBy,
  short,
}: {
  entry: BoardEntry
  blocked?: boolean
  blockedBy?: string[]
  short?: boolean
}) {
  return (
    <>
      {blocked ? (
        <StateBadge
          icon={<Lock />}
          text="Blocked"
          className="border-state-blocked/40 bg-state-blocked/10 text-state-blocked"
          tip={blockedBy?.length ? `Blocked by ${blockedBy.join(', ')}` : undefined}
        />
      ) : null}
      {entry.collisions.length > 0 ? (
        <StateBadge
          icon={<AlertTriangle />}
          text={short ? 'Collision' : 'Number collision'}
          className="border-state-collision/40 bg-state-collision/10 text-state-collision"
          tip={`Same number as ${entry.collisions.join(', ')}`}
        />
      ) : null}
      {isNotPushed(entry) ? (
        <StateBadge icon={<CloudOff />} text="Not pushed" className="border-dashed text-muted-foreground" />
      ) : null}
      {entry.changesLandedFeature ? (
        <StateBadge icon={<GitMerge />} text={short ? 'Changes landed' : 'Changes a landed feature'} />
      ) : null}
      {entry.openClarifications > 0 ? (
        <StateBadge
          icon={<HelpCircle />}
          text={
            short ? `${entry.openClarifications} open` : `${entry.openClarifications} open clarifications`
          }
          className="text-muted-foreground"
        />
      ) : null}
    </>
  )
}

function Bar({ progress, className }: { progress: { done: number; total: number }; className?: string }) {
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0
  return (
    <div
      role="progressbar"
      aria-label="Task progress"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.done}
      className={cn('h-1 overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full bg-foreground/70" style={{ width: `${pct}%` }} />
    </div>
  )
}

export function FeatureCard({
  entry,
  blocked,
  blockedBy,
  size = 'regular',
  selected,
}: {
  entry: BoardEntry
  blocked?: boolean
  blockedBy?: string[]
  size?: 'compact' | 'regular'
  selected?: boolean
}) {
  const progress = progressOf(entry)
  const compact = size === 'compact'
  const frame = cn(
    'rounded-lg border bg-card text-card-foreground shadow-xs transition-shadow',
    blocked && 'border-state-blocked/50',
    !blocked && entry.collisions.length > 0 && 'border-state-collision/50',
    selected && 'ring-2 ring-ring/60',
  )
  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn(frame, 'flex h-28 flex-col overflow-hidden px-3 pt-2.5 pb-3 hover:shadow-sm')}>
          <div className="flex h-5 items-center justify-between gap-2">
            <span className="font-mono text-[11px] tracking-wide text-muted-foreground">
              {entry.number ?? '—'}
              <span className="ml-2 font-sans tracking-normal">{shortAgo(entry.lastChangeAt)}</span>
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="rounded-full" aria-label={ownerName(entry.owner)}>
                  <OwnerAvatar owner={entry.owner} className="size-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{ownerName(entry.owner)}</TooltipContent>
            </Tooltip>
          </div>
          <div className="mt-0.5 truncate text-sm leading-5 font-medium" title={entry.title}>
            {entry.title}
          </div>
          <div className="mt-2 flex flex-nowrap gap-1 overflow-hidden">
            <PhaseBadge phase={entry.phase} />
            <FeatureStateBadges entry={entry} blocked={blocked} blockedBy={blockedBy} short />
          </div>
          {progress ? <Bar progress={progress} className="mt-auto" /> : null}
        </div>
      </TooltipProvider>
    )
  }
  return (
    <TooltipProvider>
      <div className={cn(frame, 'p-4')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-mono text-xs text-muted-foreground">{entry.number ?? '—'}</span>
            <div className="text-base font-medium">{entry.title}</div>
          </div>
          <PersonChip owner={entry.owner} />
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <PhaseBadge phase={entry.phase} />
          <FeatureStateBadges entry={entry} blocked={blocked} blockedBy={blockedBy} />
        </div>
        {progress ? (
          <div className="mt-3 flex items-center gap-2">
            <Bar progress={progress} className="flex-1" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
          </div>
        ) : null}
      </div>
    </TooltipProvider>
  )
}
