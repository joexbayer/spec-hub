import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { AlertTriangle, FolderPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody } from '@/components/panel'
import { initials } from '@/components/person-chip'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateProjectDialog } from './create-project-dialog'
import { getJson } from './http'
import { WaitingPeople } from './waiting-people'

type ProjectRow = {
  slug: string
  name: string
  defaultBranch: string
  memberCount: number
  featureCount: number
}

const projectsQuery = {
  queryKey: ['admin', 'projects'],
  queryFn: () => getJson<ProjectRow[]>('/api/projects'),
}

export function ProjectsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { data, isPending, error } = useQuery(projectsQuery)

  const onCreated = async (slug: string) => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'projects'] })
    await queryClient.invalidateQueries({ queryKey: ['me'] })
    await navigate({ href: `/p/${slug}/connect` })
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title="Projects"
        description="Every project on this hub, and the people waiting to join one."
        actions={<CreateProjectDialog onCreated={onCreated} />}
      />
      {isPending && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      )}
      {error && (
        <Panel role="alert">
          <PanelBody>
            <EmptyState icon={AlertTriangle} title="Could not load projects." />
          </PanelBody>
        </Panel>
      )}
      {data && data.length === 0 ? (
        <Panel>
          <PanelBody>
            <EmptyState icon={FolderPlus} title="No projects yet">
              Create the first one; you can assign people to it below.
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data?.map((p) => (
          <Panel key={p.slug}>
            <div className="flex items-center gap-3 px-3 pt-2 pb-2.5">
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground"
              >
                {initials(p.name)}
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <h2 className="truncate text-sm font-medium">
                  <Link to="/p/$slug" params={{ slug: p.slug }} className="hover:underline">
                    {p.name}
                  </Link>
                </h2>
                <p className="truncate font-mono text-xs text-muted-foreground">{p.slug}</p>
              </div>
            </div>
            <PanelBody className="grid grid-cols-3 divide-x text-sm">
              <Stat label="Members" value={p.memberCount} />
              <Stat label="On branches" value={p.featureCount} />
              <Stat label="Branch" value={<span className="font-mono text-xs">{p.defaultBranch}</span>} />
            </PanelBody>
          </Panel>
        ))}
      </div>
      <WaitingPeople projects={data ?? []} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
