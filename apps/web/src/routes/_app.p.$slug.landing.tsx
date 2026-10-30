import { createFileRoute } from '@tanstack/react-router'
import { LandingPage } from '@/features/landing/landing-page'

export const Route = createFileRoute('/_app/p/$slug/landing')({ component: LandingRoute })

function LandingRoute() {
  const { slug } = Route.useParams()
  return <LandingPage slug={slug} />
}
