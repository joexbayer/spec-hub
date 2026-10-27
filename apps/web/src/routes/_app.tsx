import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Outlet, redirect, useNavigate } from '@tanstack/react-router'
import { AppShell } from '@/components/layout/app-shell'
import { WaitingPage } from '@/features/access/waiting-page'
import { ApiError } from '@/lib/api'
import { signOut } from '@/lib/auth-client'
import { type Me, meQuery } from '@/lib/query'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    let me: Me
    try {
      me = await context.queryClient.ensureQueryData(meQuery)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw redirect({ to: '/sign-in' })
      throw err
    }
    // a waiting person has no project data to load; the gate below shows only the waiting page
    if (me.waiting && location.pathname !== '/') throw redirect({ to: '/' })
  },
  component: AppGate,
})

function AppGate() {
  const { data: me } = useSuspenseQuery(meQuery)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  if (me.waiting) {
    const onSignOut = async () => {
      await signOut()
      queryClient.clear()
      await navigate({ to: '/sign-in' })
    }
    return <WaitingPage login={me.user.githubLogin} onSignOut={() => void onSignOut()} />
  }
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
