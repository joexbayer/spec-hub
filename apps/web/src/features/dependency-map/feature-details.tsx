import type { BoardEntry } from '@spec-hub/core'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { ArrowUpRight, CloudOff, FileText, GitBranch, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { FeatureStateBadges, progressOf } from '@/components/feature-card'
import { PersonChip } from '@/components/person-chip'
import { PhaseBadge } from '@/components/phase-badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { InspectorPanel } from '@/features/graphs/inspector-panel'
import type { FeatureNodeData } from '@/features/graphs/nodes'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b px-4 py-3 last:border-b-0">
      <h3 className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}

// Inspector body for a feature node; all text is plain React text.
export function FeatureDetails({
  slug,
  entry,
  blockedBy,
}: {
  slug: string
  entry: BoardEntry
  blockedBy: string[]
}) {
  const progress = progressOf(entry)
  return (
    <TooltipProvider>
      <div className="text-sm">
        <Section title="Selected feature">
          <Field label="Phase">
            <PhaseBadge phase={entry.phase} />
          </Field>
          <Field label="Owner">
            <PersonChip owner={entry.owner} />
          </Field>
          <Field label="Tasks">{progress ? `${progress.done} of ${progress.total} done` : 'None yet'}</Field>
          <Field label="Last change">{formatDistanceToNow(entry.lastChangeAt, { addSuffix: true })}</Field>
          <div className="flex flex-wrap gap-1 pt-1">
            <FeatureStateBadges entry={entry} short />
          </div>
        </Section>
        <Section title="Blocked by">
          {blockedBy.length === 0 ? (
            <p className="text-muted-foreground">Nothing.</p>
          ) : (
            <ul className="space-y-1.5">
              {blockedBy.map((d) => (
                <li key={d} className="flex items-center gap-2">
                  <Lock aria-hidden className="size-3.5 shrink-0 text-state-blocked" />
                  <span className="truncate font-mono text-xs">{d}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Branches">
          {entry.branches.length === 0 ? (
            <p className="text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-1.5">
              {entry.branches.map((b) => (
                <li key={`${b.carrierUserId}:${b.branch}`} className="flex items-center gap-2">
                  <GitBranch aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 font-mono text-xs break-all">{b.branch}</span>
                  {b.pushed ? null : (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <CloudOff aria-hidden className="size-3" /> not pushed
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="p-4">
          <Button variant="outline" size="sm" className="w-full" asChild>
            <Link to="/p/$slug/f/$dir" params={{ slug, dir: entry.dir }}>
              Open feature <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function FeatureInspector({
  slug,
  data,
  onClose,
}: {
  slug: string
  data: FeatureNodeData
  onClose: () => void
}) {
  return (
    <InspectorPanel
      title={data.entry.title}
      subtitle={<span className="font-mono">{data.entry.dir}</span>}
      icon={<FileText />}
      onClose={onClose}
    >
      <FeatureDetails slug={slug} entry={data.entry} blockedBy={data.blockedBy} />
    </InspectorPanel>
  )
}
