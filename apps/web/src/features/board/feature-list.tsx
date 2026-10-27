import { type BoardEntry, PHASE_ORDER, type PhaseKind } from '@spec-hub/core'
import { Link } from '@tanstack/react-router'
import { type ColumnDef, flexRender, tableFeatures, useTable } from '@tanstack/react-table'
import { ChevronRight, GitBranch, ListFilter, Search, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { FeatureStateBadges, progressOf } from '@/components/feature-card'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { OwnerAvatar, ownerName } from '@/components/person-chip'
import { PHASE_DOT, PhaseBadge } from '@/components/phase-badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TooltipProvider } from '@/components/ui/tooltip'
import { shortAgo } from '@/lib/time'
import { cn } from '@/lib/utils'

const features = tableFeatures({})

const PHASE_LABEL: Record<PhaseKind, string> = {
  specify: 'Specify',
  clarify: 'Clarify',
  plan: 'Plan',
  tasks: 'Tasks',
  implement: 'Implement',
  implemented: 'Implemented',
}

// Fixed widths for the narrow columns; the title takes the width left over and truncates.
const WIDTH: Record<string, string> = {
  title: 'w-full max-w-0',
  owner: 'w-36',
  phase: 'w-36',
  progress: 'w-28',
  lastChange: 'w-24',
}

function columns(slug: string, blockedBy: Map<string, string[]>): ColumnDef<typeof features, BoardEntry>[] {
  return [
    {
      id: 'title',
      header: 'Feature',
      cell: ({ row }) => {
        const e = row.original
        const blockers = blockedBy.get(e.dir)
        return (
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 grid h-5 w-9 shrink-0 place-items-center rounded-md border bg-muted/50 font-mono text-[11px] text-muted-foreground">
              {e.number ?? '—'}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <Link
                to="/p/$slug/f/$dir"
                params={{ slug, dir: e.dir }}
                title={e.title}
                className="block truncate font-medium hover:underline"
              >
                {e.title}
              </Link>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex shrink-0 items-center gap-1">
                  <GitBranch aria-hidden className="size-3" />
                  {e.branches.length} {e.branches.length === 1 ? 'branch' : 'branches'}
                </span>
                <FeatureStateBadges entry={e} blocked={!!blockers?.length} blockedBy={blockers} short />
              </div>
            </div>
          </div>
        )
      },
    },
    {
      id: 'owner',
      header: 'Owner',
      cell: ({ row }) => (
        <span className="flex min-w-0 items-center gap-2">
          <OwnerAvatar owner={row.original.owner} />
          <span className="truncate">{ownerName(row.original.owner)}</span>
        </span>
      ),
    },
    { id: 'phase', header: 'Phase', cell: ({ row }) => <PhaseBadge phase={row.original.phase} /> },
    {
      id: 'progress',
      header: 'Progress',
      cell: ({ row }) => {
        const p = progressOf(row.original)
        if (!p) return <span className="text-xs text-muted-foreground">No tasks yet</span>
        const pct = p.total ? Math.round((p.done / p.total) * 100) : 0
        return (
          <span className="flex items-center gap-2">
            <span
              role="progressbar"
              aria-label="Task progress"
              aria-valuemin={0}
              aria-valuemax={p.total}
              aria-valuenow={p.done}
              className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
            >
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
          </span>
        )
      },
    },
    {
      id: 'lastChange',
      header: 'Last change',
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-muted-foreground">{shortAgo(row.original.lastChangeAt)}</span>
      ),
    },
  ]
}

export function FeatureTable({
  slug,
  entries,
  blockedBy = new Map(),
}: {
  slug: string
  entries: BoardEntry[]
  blockedBy?: Map<string, string[]>
}) {
  const table = useTable({
    features,
    columns: columns(slug, blockedBy),
    data: entries,
    getRowId: (e) => e.dir,
  })
  return (
    <TooltipProvider>
      <div className="overflow-x-auto">
        <Table className="min-w-[44rem]">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((h) => (
                  <TableHead
                    key={h.id}
                    className={cn(
                      'h-10 font-normal text-muted-foreground first:pl-4 last:pr-4',
                      WIDTH[h.column.id],
                    )}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className={cn('py-3 first:pl-4 last:pr-4', WIDTH[cell.column.id])}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}

function matches(e: BoardEntry, q: string, owner: string, phases: PhaseKind[]): boolean {
  if (owner !== 'all' && ownerName(e.owner) !== owner) return false
  if (phases.length > 0 && !phases.includes(e.phase.kind)) return false
  if (!q) return true
  return `${e.number ?? ''} ${e.title} ${e.dir}`.toLowerCase().includes(q)
}

export function FeatureList({
  slug,
  inFlight,
  stale,
  blockedBy,
}: {
  slug: string
  inFlight: BoardEntry[]
  stale: BoardEntry[]
  blockedBy?: Map<string, string[]>
}) {
  const [query, setQuery] = useState('')
  const [owner, setOwner] = useState('all')
  const [phases, setPhases] = useState<PhaseKind[]>([])
  const owners = useMemo(
    () => [...new Set([...inFlight, ...stale].map((e) => ownerName(e.owner)))].sort(),
    [inFlight, stale],
  )
  const q = query.trim().toLowerCase()
  const shown = inFlight.filter((e) => matches(e, q, owner, phases))
  const shownStale = stale.filter((e) => matches(e, q, owner, phases))
  const filtered = q !== '' || owner !== 'all' || phases.length > 0
  const clear = () => {
    setQuery('')
    setOwner('all')
    setPhases([])
  }

  return (
    <Panel>
      <PanelHeader
        title="Features in flight"
        count={filtered ? undefined : inFlight.length}
        description={
          filtered
            ? `Showing ${shown.length} of ${inFlight.length}`
            : 'Newest change first. Open one for its documents.'
        }
        action={
          <>
            <div className="relative w-full sm:w-auto">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label="Filter features"
                placeholder="Filter features…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-8 w-full bg-card pl-8 text-sm sm:w-48"
              />
            </div>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger size="sm" aria-label="Owner" className="h-8 w-36 bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 bg-card">
                  <ListFilter />
                  Phase
                  {phases.length > 0 ? (
                    <span className="rounded bg-muted px-1 text-xs tabular-nums">{phases.length}</span>
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
                    checked={phases.includes(p)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(on) =>
                      setPhases((cur) => (on ? [...cur, p] : cur.filter((x) => x !== p)))
                    }
                  >
                    <span aria-hidden className={`size-2 rounded-full ${PHASE_DOT[p]}`} />
                    {PHASE_LABEL[p]}
                  </DropdownMenuCheckboxItem>
                ))}
                {phases.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setPhases([])}>Clear</DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <PanelBody className="overflow-hidden">
        {shown.length > 0 ? (
          <FeatureTable slug={slug} entries={shown} blockedBy={blockedBy} />
        ) : (
          <EmptyState
            icon={SearchX}
            title={filtered ? 'No features match' : 'Nothing in flight'}
            action={
              filtered ? (
                <Button variant="outline" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              ) : undefined
            }
          >
            {filtered
              ? 'Try another owner, phase or search.'
              : 'Every feature has landed or gone stale. New work shows up here as soon as a clone reports it.'}
          </EmptyState>
        )}
        {shownStale.length > 0 ? (
          <Collapsible className="border-t">
            <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/40">
              <ChevronRight className="size-4 transition-transform group-data-[state=open]:rotate-90" />
              <span className="shrink-0 font-medium text-foreground">Stale ({shownStale.length})</span>
              <span className="truncate text-xs">No recent change; hidden from the graphs by default</span>
            </CollapsibleTrigger>
            <CollapsibleContent className="border-t">
              <FeatureTable slug={slug} entries={shownStale} blockedBy={blockedBy} />
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </PanelBody>
    </Panel>
  )
}
