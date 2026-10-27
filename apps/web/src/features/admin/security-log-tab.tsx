import { useInfiniteQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { AlertTriangle, ScrollText } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getJson } from './http'

type SecurityEvent = {
  id: number
  at: string
  actorUserId: string | null
  actorLogin: string | null
  type: string
  detail: unknown
  scope?: 'project' | 'person'
}
type Page = { events: SecurityEvent[]; next: number | null }

export function detailText(detail: unknown): string {
  if (detail === null || typeof detail !== 'object') return detail == null ? '' : String(detail)
  return Object.entries(detail as Record<string, unknown>)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join(', ')
}

export function SecurityLogTab({ slug }: { slug: string }) {
  const q = useInfiniteQuery({
    queryKey: ['admin', slug, 'security-events'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      getJson<Page>(`/api/projects/${slug}/security-events${pageParam ? `?before=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.next ?? undefined,
  })
  const events = q.data?.pages.flatMap((p) => p.events) ?? []

  return (
    <Panel>
      <PanelHeader title="Security log" description="Who changed what in this project, newest first." />
      <PanelBody className="overflow-hidden">
        {q.error ? (
          <EmptyState icon={AlertTriangle} title="Could not load the security log." />
        ) : q.data && events.length === 0 ? (
          <EmptyState icon={ScrollText} title="Nothing logged yet" />
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-[44rem]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 w-44 text-xs text-muted-foreground">Time</TableHead>
                  <TableHead className="h-9 w-40 text-xs text-muted-foreground">Actor</TableHead>
                  <TableHead className="h-9 w-56 text-xs text-muted-foreground">Type</TableHead>
                  <TableHead className="h-9 text-xs text-muted-foreground">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap text-muted-foreground">
                      {format(new Date(e.at), 'yyyy-MM-dd HH:mm:ss')}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.actorLogin ? `@${e.actorLogin}` : (e.actorUserId ?? 'system')}
                    </TableCell>
                    <TableCell>
                      <span className="rounded-md border bg-panel px-1.5 py-0.5 font-mono text-xs">
                        {e.type}
                      </span>
                      {e.scope === 'person' ? (
                        <Badge variant="secondary" className="ml-2 font-normal">
                          Personal
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all whitespace-normal text-muted-foreground">
                      {detailText(e.detail)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {q.hasNextPage && (
          <div className="border-t px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              Load older
            </Button>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}
