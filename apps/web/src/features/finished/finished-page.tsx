import { type FinishedFeature, matchFinished, type Owner, ownerKey } from '@spec-hub/core'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Search, SearchX } from 'lucide-react'
import { useMemo } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody } from '@/components/panel'
import { OwnerAvatar, ownerName } from '@/components/person-chip'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { isFinal } from '@/features/board/board-query'
import { type ApiError, json } from '@/lib/api'

type FinishedResponse = { defaultBranch: string; finished: FinishedFeature[] }
export type FinishedFilters = { q?: string; owner?: string }

const EVERYONE = 'everyone'

export function FinishedList({
  slug,
  data,
  q,
  owner,
  onChange,
}: {
  slug: string
  data: FinishedResponse
  q?: string
  owner?: string
  onChange: (s: FinishedFilters) => void
}) {
  const owners = useMemo(() => {
    const byKey = new Map<string, Owner>()
    for (const f of data.finished) {
      const key = ownerKey(f.owner)
      if (key && !byKey.has(key)) byKey.set(key, f.owner)
    }
    return [...byKey]
  }, [data.finished])
  const shown = matchFinished(data.finished, q ?? '', owner)
  const set = (s: FinishedFilters) => onChange({ q: s.q || undefined, owner: s.owner || undefined })

  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div className="relative w-full sm:w-72">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search finished features"
            placeholder="Search by title, folder or number"
            value={q ?? ''}
            onChange={(e) => set({ q: e.target.value, owner })}
            className="h-8 w-full bg-card pl-8 text-sm"
          />
        </div>
        <Select
          value={owner && owners.some(([k]) => k === owner) ? owner : EVERYONE}
          onValueChange={(v) => set({ q, owner: v === EVERYONE ? undefined : v })}
        >
          <SelectTrigger size="sm" aria-label="Owner" className="h-8 w-40 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERYONE}>Everyone</SelectItem>
            {owners.map(([key, o]) => (
              <SelectItem key={key} value={key}>
                {ownerName(o)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <PanelBody>
        {data.finished.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="No finished features yet">
            They appear once a connected clone that has fetched {data.defaultBranch} reports.
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="No finished feature matches"
            action={
              <Button variant="outline" size="sm" onClick={() => onChange({})}>
                Clear filters
              </Button>
            }
          >
            Try another owner or search.
          </EmptyState>
        ) : (
          <ul className="divide-y">
            {shown.map((f) => (
              <li key={f.dir}>
                <Link
                  to="/p/$slug/f/$dir"
                  params={{ slug, dir: f.dir }}
                  search={{ branch: data.defaultBranch }}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm hover:bg-muted/40"
                >
                  <span className="w-10 shrink-0 font-mono text-xs text-muted-foreground">
                    {f.number ?? '—'}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{f.title}</span>
                  {f.inFlight ? <Badge variant="outline">In flight again</Badge> : null}
                  {f.reported ? null : (
                    <span className="text-xs text-muted-foreground">documents not reported yet</span>
                  )}
                  {f.tasks ? (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {f.tasks.done}/{f.tasks.total}
                    </span>
                  ) : null}
                  <span className="flex items-center gap-2 text-xs">
                    <OwnerAvatar owner={f.owner} />
                    {ownerName(f.owner)}
                  </span>
                  <span className="w-40 shrink-0 text-right text-xs text-muted-foreground">
                    {f.landedAt === null
                      ? 'landing time unknown'
                      : `landed ${formatDistanceToNow(f.landedAt, { addSuffix: true })}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  )
}

export function FinishedPage({
  slug,
  q,
  owner,
  onChange,
}: {
  slug: string
  q?: string
  owner?: string
  onChange: (s: FinishedFilters) => void
}) {
  const query = useQuery({
    queryKey: ['finished', slug],
    queryFn: async () =>
      json<FinishedResponse>(await fetch(`/api/projects/${slug}/finished`, { credentials: 'same-origin' })),
    refetchInterval: (qq) => (isFinal(qq.state.error) ? false : 60_000),
    refetchIntervalInBackground: false,
    retry: (count, err) => !isFinal(err) && count < 1,
  })
  const data = query.data
  const status = (query.error as ApiError | null)?.status

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Finished features"
        description={data ? `${data.finished.length} on ${data.defaultBranch}` : slug}
      />
      {query.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" role="status" aria-label="Loading finished features" />
      ) : isFinal(query.error) ? (
        <Panel role="alert">
          <PanelBody>
            <EmptyState
              icon={AlertTriangle}
              title={
                status === 403 ? 'You are not a member of this project' : `There is no project called ${slug}`
              }
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/">Go to your projects</Link>
                </Button>
              }
            >
              {status === 403
                ? 'Ask one of its admins to add you.'
                : 'Check the link, or pick a project you belong to.'}
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : query.isError || !data ? (
        <Panel role="alert">
          <PanelBody>
            <EmptyState
              icon={AlertTriangle}
              title="Could not load finished features"
              action={
                <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                  Retry
                </Button>
              }
            >
              The hub did not answer.
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : (
        <FinishedList slug={slug} data={data} q={q} owner={owner} onChange={onChange} />
      )}
    </div>
  )
}
