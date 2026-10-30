import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistance, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, Lock, LockOpen } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { json } from '@/lib/api'
import { type LandingView, landingQuery } from './landing-query'

const ago = (ms: number) => formatDistanceToNow(new Date(ms), { addSuffix: true })

type Ending = { id: number; login: string; kind: 'lock' | 'remove' | 'leave' }

const head = 'h-9 text-xs text-muted-foreground'

export function LandingPage({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const landing = useQuery(landingQuery(slug))
  const [ending, setEnding] = useState<Ending | null>(null)

  const end = useMutation({
    mutationFn: async (id: number) =>
      json<LandingView>(
        await fetch(`/api/projects/${slug}/landing/${id}/end`, {
          method: 'POST',
          credentials: 'same-origin',
        }),
      ),
    onSuccess: (view) => {
      toast.success('Done')
      setEnding(null)
      queryClient.setQueryData(landingQuery(slug).queryKey, view)
    },
    onError: (e) => {
      toast.error(e.message)
      setEnding(null)
      void queryClient.invalidateQueries({ queryKey: ['landing', slug] })
    },
  })

  const view = landing.data
  const holder = view?.holder

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Landing lock"
        description="Agents take the lock over MCP before they gate and land. Anyone on the project can open a stuck lock."
      >
        {view ? (
          <p className="text-xs text-muted-foreground">
            About {view.minutesPerTurn} min per turn, landing on {view.defaultBranch}
          </p>
        ) : null}
      </PageHeader>

      {landing.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : landing.error ? (
        <EmptyState icon={AlertTriangle} title="Could not load the landing lock">
          {landing.error.message}
        </EmptyState>
      ) : (
        <>
          <Panel>
            <PanelHeader title="Holder" />
            <PanelBody className="flex flex-wrap items-center gap-3 p-4">
              {holder ? (
                <>
                  <Lock aria-hidden className="size-4 text-muted-foreground" />
                  <p className="flex-1 text-sm">
                    <span className="font-medium">@{holder.login}</span> holds the lock for {holder.minutes}{' '}
                    min
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEnding({ id: holder.id, login: holder.login, kind: 'lock' })}
                  >
                    Open lock
                  </Button>
                </>
              ) : (
                <>
                  <LockOpen aria-hidden className="size-4 text-muted-foreground" />
                  <p className="text-sm">The lock is free</p>
                </>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Waiting" count={view?.waiting.length} />
            <PanelBody className="overflow-hidden">
              {view?.waiting.length === 0 ? (
                <EmptyState icon={LockOpen} title="Nobody is waiting">
                  Agents that ask for the lock while it is held queue up here.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[36rem]">
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={`${head} w-16`}>#</TableHead>
                        <TableHead className={head}>Who</TableHead>
                        <TableHead className={`${head} w-40`}>Asked</TableHead>
                        <TableHead className={`${head} w-36`}>Estimate</TableHead>
                        <TableHead className="h-9 w-24" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view?.waiting.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="tabular-nums">{w.position}</TableCell>
                          <TableCell className="font-medium">
                            @{w.login}
                            {w.mine ? (
                              <span className="font-normal text-muted-foreground"> (you)</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{ago(w.askedAt)}</TableCell>
                          <TableCell className="text-muted-foreground">about {w.etaMinutes} min</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() =>
                                setEnding({ id: w.id, login: w.login, kind: w.mine ? 'leave' : 'remove' })
                              }
                            >
                              {w.mine ? 'Leave' : 'Remove'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="History" />
            <PanelBody className="overflow-hidden">
              {view?.history.length === 0 ? (
                <EmptyState icon={Lock} title="No landings yet">
                  Finished turns show up here.
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="min-w-[36rem]">
                    <TableHeader className="bg-muted/40">
                      <TableRow className="hover:bg-transparent">
                        <TableHead className={head}>Who</TableHead>
                        <TableHead className={`${head} w-28`}>Outcome</TableHead>
                        <TableHead className={`${head} w-40`}>Ended</TableHead>
                        <TableHead className={`${head} w-32`}>Held</TableHead>
                        <TableHead className={`${head} w-32`}>By</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view?.history.map((h) => (
                        <TableRow key={h.id}>
                          <TableCell className="font-medium">@{h.login}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{h.outcome}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{ago(h.endedAt)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {h.startedAt === null
                              ? ''
                              : formatDistance(new Date(h.startedAt), new Date(h.endedAt))}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {h.endedBy ? `by @${h.endedBy}` : ''}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </PanelBody>
          </Panel>
        </>
      )}

      <Dialog open={ending !== null} onOpenChange={(open) => !open && setEnding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {ending?.kind === 'lock'
                ? 'Open the lock?'
                : ending?.kind === 'leave'
                  ? 'Leave the queue?'
                  : 'Remove place?'}
            </DialogTitle>
            <DialogDescription>
              {ending?.kind === 'lock'
                ? `Open @${ending.login}'s lock? Their agent is told the next time it calls.`
                : ending?.kind === 'leave'
                  ? 'Give up your place in the queue?'
                  : `Remove @${ending?.login}'s place in the queue? Their agent is told the next time it calls.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnding(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={end.isPending}
              onClick={() => ending && end.mutate(ending.id)}
            >
              {ending?.kind === 'lock' ? 'Open lock' : ending?.kind === 'leave' ? 'Leave' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
