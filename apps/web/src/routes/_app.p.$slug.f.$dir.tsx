import { createFileRoute, useNavigate } from '@tanstack/react-router'
import type { FeatureTab } from '@/features/feature-detail/document-tabs'
import { FeaturePage } from '@/features/feature-detail/feature-page'

// a fixed tab or an extra document's name without .md; the page falls back to spec for one the version lacks
const TAB_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

interface FeatureSearch {
  tab?: FeatureTab
  branch?: string
}

export const Route = createFileRoute('/_app/p/$slug/f/$dir')({
  validateSearch: (search: Record<string, unknown>): FeatureSearch => ({
    tab: typeof search.tab === 'string' && TAB_NAME.test(search.tab) ? search.tab : undefined,
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
