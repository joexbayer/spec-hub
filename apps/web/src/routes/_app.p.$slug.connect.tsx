import { createFileRoute } from '@tanstack/react-router'
import { ConnectPage } from '@/features/connect/connect-page'

export const Route = createFileRoute('/_app/p/$slug/connect')({ component: ConnectRoute })

function ConnectRoute() {
  const { slug } = Route.useParams()
  return <ConnectPage slug={slug} />
}
