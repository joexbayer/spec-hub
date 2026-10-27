import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { FEATURE_TABS, type FeatureTab } from '@/features/feature-detail/document-tabs'
import { FeaturePage } from '@/features/feature-detail/feature-page'

interface FeatureSearch {
  tab?: FeatureTab
  branch?: string
}

export const Route = createFileRoute('/_app/p/$slug/f/$dir')({
  validateSearch: (search: Record<string, unknown>): FeatureSearch => ({
    tab: FEATURE_TABS.find((t) => t === search.tab),
    branch: typeof search.branch === 'string' && search.branch ? search.branch : undefined,
  }),
  component: FeatureRoute,
})

function FeatureRoute() {
  const { slug, dir } = Route.useParams()
  const { tab, branch } = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  return (
    <FeaturePage
      slug={slug}
      dir={dir}
      tab={tab ?? 'spec'}
      branch={branch}
      onTabChange={(t) => navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}
      onBranchChange={(b) => navigate({ search: (s) => ({ ...s, branch: b }), replace: true })}
    />
  )
}
