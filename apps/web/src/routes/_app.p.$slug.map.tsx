import { createFileRoute } from '@tanstack/react-router'
import { DependencyMapPage } from '@/features/dependency-map/dependency-map-page'

export const Route = createFileRoute('/_app/p/$slug/map')({
  component: MapRoute,
})

function MapRoute() {
  const { slug } = Route.useParams()
  return <DependencyMapPage slug={slug} />
}
