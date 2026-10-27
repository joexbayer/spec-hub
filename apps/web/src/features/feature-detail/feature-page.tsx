import type { Owner } from '@spec-hub/core'
import { titleFromDir } from '@spec-hub/core'
import type { FeatureDetail } from '@spec-hub/server/board-query'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudOff,
  FileQuestion,
  FileText,
  GitBranch,
  GitMerge,
  HelpCircle,
  ListChecks,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { StateBadge } from '@/components/feature-card'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { OwnerAvatar, ownerName } from '@/components/person-chip'
import { PhaseBadge } from '@/components/phase-badge'
import { PhaseStepper } from '@/components/phase-stepper'
import { StatStrip, StatTile } from '@/components/stat-strip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useBoard } from '@/features/board/board-query'
import { ApiError, json } from '@/lib/api'
import { shortAgo } from '@/lib/time'
import { DocumentTabs, type FeatureTab } from './document-tabs'
import { DependenciesPanel, VersionsPanel } from './graph-panels'

const UNKNOWN_OWNER: Owner = { kind: 'unknown' } as Owner

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 14
  const c = 2 * Math.PI * r
  const frac = total > 0 ? Math.min(done / total, 1) : 0
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 36 36" aria-hidden>
        <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className="stroke-primary"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <span>
        {done}/{total}
      </span>
    </span>
  )
}

function relative(ts: number): string {
  return formatDistanceToNow(ts, { addSuffix: true })
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 p-6" aria-busy="true">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-96 max-w-full" />
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  )
}

function RailSection({
  icon,
  title,
  count,
  children,
}: {
  icon: ReactNode
  title: string
  count?: number
  children: ReactNode
}) {
  return (
    <section className="space-y-3 px-5 py-5">
      <h2 className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-muted-foreground">
        {icon}
        {title}
        {count !== undefined ? (
          <span className="ml-auto rounded-md bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
            {count}
          </span>
        ) : null}
      </h2>
      {children}
    </section>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}

export function FeaturePage({
  slug,
  dir,
  tab,
  branch,
  onTabChange,
  onBranchChange,
}: {
  slug: string
  dir: string
  tab: FeatureTab
  branch: string | undefined
  onTabChange: (tab: FeatureTab) => void
  onBranchChange: (branch: string) => void
}) {
  const { data, error, isPending } = useQuery({
    queryKey: ['feature', slug, dir, branch],
    queryFn: async () => {
      const qs = branch ? `?branch=${encodeURIComponent(branch)}` : ''
      const res = await fetch(
        `/api/projects/${encodeURIComponent(slug)}/features/${encodeURIComponent(dir)}${qs}`,
        { credentials: 'same-origin' },
      )
      return json<FeatureDetail>(res)
    },
    refetchInterval: 10_000,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  })
  const members = useBoard(slug).board.data?.members ?? []

  if (isPending) return <LoadingSkeleton />
  if (error) {
    return (
      <div className="p-4 md:p-6">
        <Panel>
          <PanelBody>
            {error instanceof ApiError && error.status === 404 ? (
              <EmptyState
                icon={FileQuestion}
                title={`No feature ${dir}`}
                action={
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/p/$slug" params={{ slug }}>
                      Back to the board
                    </Link>
                  </Button>
                }
              >
                No feature {dir} in flight or recently landed.
              </EmptyState>
            ) : (
              <EmptyState icon={AlertTriangle} title="Could not load this feature">
                {error.message}
              </EmptyState>
            )}
          </PanelBody>
        </Panel>
      </div>
    )
  }

  const { entry, landed, versions, shown } = data
  const number = entry?.number ?? dir.split('-')[0]
  const title = entry?.title ?? titleFromDir(dir)
  const isLanded = landed !== null && entry === null
  const shownBranch = shown?.branch
  const tasks = versions.find((v) => v.branch === shownBranch)?.tasks ?? null
  const docsPresent = shown ? Object.values(shown.docs).filter(Boolean).length : 0
  const lastChangeAt = entry?.lastChangeAt ?? Math.max(0, ...versions.map((v) => v.lastChangeAt))
  const openClarifications = entry?.openClarifications ?? 0
  const current = versions.find((v) => v.branch === shownBranch)
  const carriers = [...new Set(versions.map((v) => v.carrierUserId))]
  const owner = entry?.owner ?? UNKNOWN_OWNER
  const ownerId = owner.kind === 'member' ? owner.userId : null
  const carrying = (id: string) => {
    const n = versions.filter((v) => v.carrierUserId === id).length
    return `carries ${n} ${n === 1 ? 'branch' : 'branches'}`
  }
  // The owner first, then everyone else carrying a branch.
  const people = [
    {
      key: 'owner',
      owner,
      role: ownerId && carriers.includes(ownerId) ? `Owner, ${carrying(ownerId)}` : 'Owner',
    },
    ...carriers
      .filter((id) => id !== ownerId)
      .map((id) => {
        const m = members.find((x) => x.userId === id)
        const o: Owner = m ? { kind: 'member', ...m } : UNKNOWN_OWNER
        return { key: id, owner: o, role: `Carrier, ${carrying(id)}` }
      }),
  ]
  const pct = tasks && tasks.tasksTotal > 0 ? Math.round((tasks.tasksDone / tasks.tasksTotal) * 100) : null

  return (
    <div className="grid min-h-full xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6 p-4 md:p-6">
        <header className="space-y-3">
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <span className="rounded-md border bg-panel px-1.5 py-0.5 text-foreground">{number}</span>
            <span className="truncate">{dir}</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
          <div className="flex flex-wrap items-center gap-2">
            {entry ? <PhaseBadge phase={entry.phase} /> : null}
            {isLanded ? (
              <span className="inline-flex h-5 items-center gap-1 rounded-md border border-phase-landed/40 bg-phase-landed/10 px-1.5 text-xs">
                <CheckCircle2 aria-hidden className="size-3 text-phase-landed" /> Landed
              </span>
            ) : null}
            {entry ? (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-1.5 text-xs">
                <OwnerAvatar owner={entry.owner} className="size-4" />
                {ownerName(entry.owner)}
              </span>
            ) : null}
            {versions.length > 1 ? (
              <Select value={shownBranch ?? ''} onValueChange={onBranchChange}>
                <SelectTrigger
                  size="sm"
                  aria-label="Branch"
                  className="h-6 max-w-72 gap-1.5 px-1.5 font-mono text-xs"
                >
                  <GitBranch aria-hidden className="size-3" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {versions.map((v) => (
                    <SelectItem key={v.branch} value={v.branch} className="font-mono text-xs">
                      {v.branch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              versions.map((v) => (
                <span
                  key={v.branch}
                  className="inline-flex h-6 items-center gap-1.5 rounded-md border bg-card px-1.5 font-mono text-xs"
                >
                  <GitBranch aria-hidden className="size-3" />
                  {v.branch}
                </span>
              ))
            )}
            <TooltipProvider>
              {current && !current.pushed ? (
                <StateBadge
                  icon={<CloudOff />}
                  text="Not pushed"
                  className="border-dashed text-muted-foreground"
                />
              ) : null}
              {entry && entry.collisions.length > 0 ? (
                <StateBadge
                  icon={<AlertTriangle />}
                  text={`Number collides with ${entry.collisions.join(', ')}`}
                  className="border-state-collision/40 bg-state-collision/10 text-state-collision"
                />
              ) : null}
              {entry?.changesLandedFeature ? (
                <StateBadge icon={<GitMerge />} text="Changes a landed feature" />
              ) : null}
            </TooltipProvider>
          </div>
        </header>

        <StatStrip
          className="md:grid-cols-5"
          footer={
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                Delivery:{' '}
                <span className="font-medium text-foreground">
                  {pct === null ? 'no tasks yet' : `${pct}% of tasks done`}
                </span>
              </span>
              <span>
                {carriers.length} {carriers.length === 1 ? 'person carries' : 'people carry'} it
              </span>
              {shownBranch ? (
                <span>
                  Showing <span className="font-mono text-foreground">{shownBranch}</span>
                </span>
              ) : null}
            </div>
          }
        >
          <StatTile
            label="Tasks"
            icon={<ListChecks />}
            value={tasks ? <ProgressRing done={tasks.tasksDone} total={tasks.tasksTotal} /> : '—'}
          />
          <StatTile
            label="Questions"
            icon={<HelpCircle />}
            value={openClarifications}
            caption={openClarifications ? 'Answer them in spec.md' : 'Nothing open'}
          />
          <StatTile
            label="Documents"
            icon={<FileText />}
            value={`${docsPresent} of 3`}
            caption="spec, plan and tasks"
          />
          <StatTile
            label="Branches"
            icon={<GitBranch />}
            value={versions.length}
            caption={`${versions.filter((v) => v.pushed).length} pushed`}
          />
          <StatTile
            label="Last change"
            icon={<Clock />}
            value={lastChangeAt ? shortAgo(lastChangeAt) : '—'}
            caption={lastChangeAt ? relative(lastChangeAt) : undefined}
          />
        </StatStrip>

        <Panel>
          <PanelHeader
            title="Phase"
            description={isLanded ? 'Landed on the default branch' : 'Where the shown version stands'}
          />
          <PanelBody className="overflow-x-auto px-4 py-4">
            <PhaseStepper phase={entry?.phase ?? { kind: 'implemented', total: 0 }} landed={isLanded} />
          </PanelBody>
        </Panel>

        <DocumentTabs
          shown={shown}
          tab={tab}
          onTabChange={onTabChange}
          versions={<VersionsPanel slug={slug} detail={data} />}
          dependencies={<DependenciesPanel slug={slug} dir={dir} />}
        />
      </div>

      <aside className="divide-y border-t xl:border-t-0 xl:border-l">
        <RailSection icon={<Users />} title="People" count={people.length}>
          <ul className="space-y-3">
            {people.map((p) => (
              <li key={p.key} className="flex items-center gap-3">
                <OwnerAvatar owner={p.owner} size="default" />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-sm font-medium">{ownerName(p.owner)}</div>
                  <div className="truncate text-xs text-muted-foreground">{p.role}</div>
                </div>
              </li>
            ))}
          </ul>
        </RailSection>
        <RailSection icon={<Clock />} title="Time">
          <div className="space-y-2">
            {landed ? <Fact label="First seen">{relative(landed.firstSeenAt)}</Fact> : null}
            <Fact label="Last change">{lastChangeAt ? relative(lastChangeAt) : '—'}</Fact>
          </div>
        </RailSection>
        <RailSection icon={<FileText />} title="Documents" count={docsPresent}>
          {shown ? (
            <ul className="space-y-2">
              {(['spec', 'plan', 'tasks'] as const).map((name) => {
                const doc = shown.docs[name]
                return (
                  <li key={name} className="flex items-center gap-2 text-sm">
                    <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className={doc ? 'font-medium' : 'text-muted-foreground'}>{name}.md</span>
                    <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                      {doc ? (
                        <>
                          {doc.tooLarge ? <Badge variant="outline">too large</Badge> : null}
                          {doc.unreadable ? <Badge variant="outline">unreadable</Badge> : null}
                          <span className="font-mono">{doc.oid.slice(0, 8)}</span>
                          <span className="tabular-nums">{doc.size} B</span>
                        </>
                      ) : (
                        'missing'
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No branch to read documents from.</p>
          )}
        </RailSection>
      </aside>
    </div>
  )
}
