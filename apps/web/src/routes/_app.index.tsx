import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ChevronRight, FolderPlus } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody } from '@/components/panel'
import { initials } from '@/components/person-chip'
import { Button } from '@/components/ui/button'
import { meQuery } from '@/lib/query'

export const Route = createFileRoute('/_app/')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    const only = me.projects.length === 1 ? me.projects[0] : undefined
    if (only) throw redirect({ to: '/p/$slug', params: { slug: only.slug } })
  },
  component: Home,
})

function Home() {
  const me = Route.useRouteContext().queryClient.getQueryData(meQuery.queryKey)
  if (!me) return null
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader title="Projects" description={`Signed in as @${me.user.githubLogin}.`} />
      {me.projects.length === 0 ? (
        <Panel>
          <PanelBody>
            <EmptyState
              icon={FolderPlus}
              title="You're not in any project yet"
              action={
                me.isHubAdmin ? (
                  <Button asChild>
                    <Link to="/admin/projects">
                      <FolderPlus /> Go to Projects
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              As a hub admin, create a project on the Projects page and you become its first admin. To join an
              existing project, ask one of its admins to add you.
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {me.projects.map((p) => (
            <li key={p.slug}>
              <Link
                to="/p/$slug"
                params={{ slug: p.slug }}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/40"
              >
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {initials(p.name)}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    {p.slug} · {p.role}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
