import { createFileRoute } from '@tanstack/react-router'
import { FinishedPage } from '@/features/finished/finished-page'

const text = (v: unknown) => (typeof v === 'string' && v !== '' ? v : undefined)

export const Route = createFileRoute('/_app/p/$slug/finished')({
  validateSearch: (search: Record<string, unknown>): { q?: string; owner?: string } => ({
    q: text(search.q),
    owner: text(search.owner),
  }),
  component: FinishedRoute,
})

function FinishedRoute() {
  const { slug } = Route.useParams()
  const { q, owner } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <FinishedPage slug={slug} q={q} owner={owner} onChange={(s) => navigate({ search: s, replace: true })} />
  )
}
