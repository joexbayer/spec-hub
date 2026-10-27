import { createFileRoute, redirect } from '@tanstack/react-router'
import { ProjectAdminPage } from '@/features/admin/project-admin-page'
import { meQuery } from '@/lib/query'

export const Route = createFileRoute('/_app/p/$slug/admin')({
  beforeLoad: async ({ context, params }) => {
    const me = await context.queryClient.ensureQueryData(meQuery)
    if (me.projects.find((p) => p.slug === params.slug)?.role !== 'admin') {
      throw redirect({ to: '/p/$slug', params: { slug: params.slug } })
    }
  },
  component: AdminRoute,
})

function AdminRoute() {
  const { slug } = Route.useParams()
  return <ProjectAdminPage slug={slug} />
}
