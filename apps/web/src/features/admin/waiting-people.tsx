import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Hourglass, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { initials } from '@/components/person-chip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { json } from '@/lib/api'
import { errorMessage, send } from './http'
import { type Person, peopleQuery } from './people'

// Hub admins: people who signed in but are in no project yet (FR-027), each assignable to any project.
export function WaitingPeople({ projects }: { projects: { slug: string; name: string }[] }) {
  const { data, error } = useQuery(peopleQuery)
  const waiting = (data ?? []).filter((p) => p.waiting)
  return (
    <Panel>
      <PanelHeader
        icon={<Hourglass />}
        title="Waiting for access"
        count={waiting.length}
        description="Signed in, but in no project yet. Assign each one to a project."
      />
      <PanelBody className="overflow-hidden">
        {error && <EmptyState icon={AlertTriangle} title="Could not load people." />}
        {data && waiting.length === 0 && (
          <EmptyState icon={UserCheck} title="Nobody is waiting">
            People appear here after they sign in.
          </EmptyState>
        )}
        {waiting.length > 0 && (
          <div className="overflow-x-auto">
            <Table className="min-w-[36rem]">
              <TableHeader className="bg-muted/40">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-9 text-xs text-muted-foreground">Person</TableHead>
                  <TableHead className="h-9 w-80 text-xs text-muted-foreground">Assign to</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waiting.map((p) => (
                  <WaitingRow key={p.id} person={p} projects={projects} />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </PanelBody>
    </Panel>
  )
}

function WaitingRow({ person, projects }: { person: Person; projects: { slug: string; name: string }[] }) {
  const queryClient = useQueryClient()
  const [slug, setSlug] = useState('')
  const assign = useMutation({
    mutationFn: async () => {
      const res = await send('POST', `/api/projects/${slug}/members`, {
        githubLogin: person.githubLogin,
        role: 'member',
      })
      if (res.status === 409) throw new Error('Already a member')
      await json(res)
    },
    onSuccess: async () => {
      toast.success(`Added @${person.githubLogin} to ${slug}`)
      // people (no longer waiting) and the projects' member counts
      await queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })
  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="border">
            {person.image ? <AvatarImage src={person.image} alt="" /> : null}
            <AvatarFallback className="text-xs">{initials(person.githubLogin)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-medium">@{person.githubLogin}</div>
            {person.name && person.name !== person.githubLogin && (
              <div className="truncate text-xs text-muted-foreground">{person.name}</div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select value={slug} onValueChange={setSlug}>
            <SelectTrigger size="sm" className="w-48" aria-label={`Project for ${person.githubLogin}`}>
              <SelectValue placeholder="Pick a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!slug || assign.isPending} onClick={() => assign.mutate()}>
            Assign
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
