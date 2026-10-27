import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, AtSign, Clock, Trash2, UserPlus, Users } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { initials } from '@/components/person-chip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { json } from '@/lib/api'
import { errorMessage, getJson, send } from './http'
import { assignable, peopleQuery } from './people'

export type Member = {
  githubId: string
  githubLogin: string
  userId: string | null
  role: 'admin' | 'member'
  name: string | null
  image: string | null
  // assigned by username; that GitHub account hasn't signed in yet
  pending: boolean
}

const membersKey = (slug: string) => ['admin', slug, 'members']

async function check(res: Response, conflict: string) {
  if (res.ok) return
  if (res.status === 409) throw new Error(conflict)
  // 404 "no GitHub user @x", 422, 502 "couldn't reach GitHub": the hub's own message
  await json(res)
}

export function MembersTab({ slug }: { slug: string }) {
  const queryClient = useQueryClient()
  const base = `/api/projects/${slug}/members`
  const members = useQuery({ queryKey: membersKey(slug), queryFn: () => getJson<Member[]>(base) })
  const people = useQuery(peopleQuery)
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: membersKey(slug) })
    await queryClient.invalidateQueries({ queryKey: peopleQuery.queryKey })
  }
  const onError = (err: unknown) => toast.error(errorMessage(err))
  const listId = useId()

  const setRole = useMutation({
    mutationFn: async (v: { githubId: string; role: string }) =>
      check(
        await send('PATCH', `${base}/${encodeURIComponent(v.githubId)}`, { role: v.role }),
        'A project needs at least one admin',
      ),
    onSuccess: refresh,
    onError,
  })
  const remove = useMutation({
    mutationFn: async (githubId: string) =>
      check(
        await send('DELETE', `${base}/${encodeURIComponent(githubId)}`),
        'A project needs at least one admin',
      ),
    onSuccess: refresh,
    onError,
  })

  const [login, setLogin] = useState('')
  const [role, setNewRole] = useState<'member' | 'admin'>('member')
  const githubLogin = login.trim().replace(/^@/, '')
  const add = useMutation({
    mutationFn: async () => {
      const res = await send('POST', base, { githubLogin, role })
      await check(res, `@${githubLogin} is already a member`)
      return (await res.json()) as { githubLogin: string; pending: boolean }
    },
    onSuccess: async (added) => {
      toast.success(
        added.pending
          ? `Added @${added.githubLogin}; they join once they sign in`
          : `Added @${added.githubLogin}`,
      )
      setLogin('')
      setNewRole('member')
      await refresh()
    },
  })
  const candidates = assignable(people.data ?? [], members.data ?? [])

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          icon={<UserPlus />}
          title="Add member"
          description="Suggestions are people who have signed in and aren't members yet."
        />
        <PanelBody className="p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (githubLogin) add.mutate()
            }}
            className="space-y-2"
          >
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-72">
                <AtSign
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  aria-label="GitHub username"
                  placeholder="GitHub username"
                  list={listId}
                  autoComplete="off"
                  spellCheck={false}
                  value={login}
                  aria-invalid={add.isError || undefined}
                  onChange={(e) => {
                    setLogin(e.target.value)
                    if (add.isError) add.reset()
                  }}
                  className="pl-8"
                />
                <datalist id={listId}>
                  {candidates.map((p) => (
                    <option key={p.id} value={p.githubLogin}>
                      {p.waiting ? `${p.name} (waiting)` : p.name}
                    </option>
                  ))}
                </datalist>
              </div>
              <Select value={role} onValueChange={(v) => setNewRole(v as 'member' | 'admin')}>
                <SelectTrigger className="w-32" aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={!githubLogin || add.isPending}>
                <UserPlus /> Add member
              </Button>
            </div>
            {add.error ? (
              <p role="alert" className="flex items-center gap-1.5 text-sm text-destructive">
                <AlertTriangle aria-hidden className="size-3.5" />
                {errorMessage(add.error)}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Any GitHub username works; someone who hasn't signed in yet joins on their first sign-in.
              </p>
            )}
          </form>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Members" count={members.data?.length} />
        <PanelBody className="overflow-hidden">
          {members.error ? (
            <EmptyState icon={AlertTriangle} title="Could not load members." />
          ) : members.data && members.data.length === 0 ? (
            <EmptyState icon={Users} title="No members yet">
              Add someone above.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[22rem]">
                <TableHeader className="bg-muted/40">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs text-muted-foreground">Member</TableHead>
                    <TableHead className="h-9 w-40 text-xs text-muted-foreground">Role</TableHead>
                    <TableHead className="h-9 w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.data?.map((m) => (
                    <TableRow key={m.githubId}>
                      <TableCell className="py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar className="border">
                            {m.image ? <AvatarImage src={m.image} alt="" /> : null}
                            <AvatarFallback className="text-xs">{initials(m.githubLogin)}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 leading-tight">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-medium">{m.name || `@${m.githubLogin}`}</span>
                              {m.pending ? (
                                <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-md border border-dashed px-1.5 text-xs text-muted-foreground">
                                  <Clock aria-hidden className="size-3" />
                                  Pending — hasn't signed in
                                </span>
                              ) : null}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">@{m.githubLogin}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.role}
                          onValueChange={(next) => setRole.mutate({ githubId: m.githubId, role: next })}
                        >
                          <SelectTrigger size="sm" className="w-32" aria-label={`Role of ${m.githubLogin}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${m.githubLogin}`}
                            >
                              <Trash2 />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove @{m.githubLogin}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Their clones leave the board. They lose access to this project.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove.mutate(m.githubId)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  )
}
