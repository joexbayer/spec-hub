import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, KeyRound, Terminal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
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
import { CreateTokenDialog } from './create-token-dialog'
import { type TokenRow, tokensQuery } from './token-query'

const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true })

export function TokensPage() {
  const queryClient = useQueryClient()
  const tokens = useQuery(tokensQuery)
  const [revoking, setRevoking] = useState<TokenRow | null>(null)

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/tokens/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) await json(res)
    },
    onSuccess: () => {
      toast.success('Token revoked')
      setRevoking(null)
      void queryClient.invalidateQueries({ queryKey: ['tokens'] })
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Tokens"
        description="Personal tokens let your clones and agents talk to the hub."
        actions={<CreateTokenDialog />}
      />

      <div className="flex gap-3 rounded-xl border bg-panel p-4 text-sm">
        <Terminal aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">A token acts as you</p>
          <p className="text-muted-foreground">
            Create one per machine or agent, so you can revoke one without breaking the others. The hub shows
            a token only once, when you create it.
          </p>
        </div>
      </div>

      <Panel>
        <PanelHeader title="Personal tokens" count={tokens.data?.length} />
        <PanelBody className="overflow-hidden">
          {tokens.isPending ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : tokens.error ? (
            <EmptyState icon={AlertTriangle} title="Could not load tokens">
              {tokens.error.message}
            </EmptyState>
          ) : tokens.data.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="No tokens yet"
              action={<CreateTokenDialog triggerLabel="Create your first token" variant="outline" />}
            >
              Create one to connect a clone or an agent.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[40rem]">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs text-muted-foreground">Name</TableHead>
                    <TableHead className="h-9 w-40 text-xs text-muted-foreground">Token</TableHead>
                    <TableHead className="h-9 w-36 text-xs text-muted-foreground">Created</TableHead>
                    <TableHead className="h-9 w-40 text-xs text-muted-foreground">Last used</TableHead>
                    <TableHead className="h-9 w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.data.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="py-2.5">
                        <span className="flex items-center gap-3">
                          <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-panel text-muted-foreground">
                            <KeyRound aria-hidden className="size-4" />
                          </span>
                          <span className="truncate font-medium">{t.name}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-md border bg-panel px-1.5 py-0.5 font-mono text-xs">
                          {t.start ? `${t.start}…` : '—'}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{ago(t.createdAt)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                          <span
                            aria-hidden
                            className={`size-1.5 rounded-full ${t.lastRequest ? 'bg-phase-implemented' : 'bg-muted-foreground/40'}`}
                          />
                          {t.lastRequest ? ago(t.lastRequest) : 'never'}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => setRevoking(t)}
                        >
                          Revoke
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

      <Dialog open={revoking !== null} onOpenChange={(open) => !open && setRevoking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke token?</DialogTitle>
            <DialogDescription>
              Anything using &ldquo;{revoking?.name}&rdquo; stops working immediately. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevoking(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revoking && revoke.mutate(revoking.id)}
            >
              Revoke
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
