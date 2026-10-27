import { createFileRoute, redirect } from '@tanstack/react-router'
import { ProjectsPage } from '@/features/admin/projects-page'
import { meQuery } from '@/lib/query'

export const Route = createFileRoute('/_app/admin/projects')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (!me.isHubAdmin) throw redirect({ to: '/' })
  },
  component: ProjectsPage,
})
