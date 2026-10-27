import { createFileRoute } from '@tanstack/react-router'
import { BoardPage, type BoardView } from '@/features/board/board-page'

const VIEWS: BoardView[] = ['list', 'pipeline', 'work']

export const Route = createFileRoute('/_app/p/$slug/')({
  validateSearch: (search: Record<string, unknown>): { view?: BoardView } => ({
    view: VIEWS.find((v) => v === search.view),
  }),
  component: BoardRoute,
})

function BoardRoute() {
  const { slug } = Route.useParams()
  const { view = 'list' } = Route.useSearch()
  const navigate = Route.useNavigate()
  return <BoardPage slug={slug} view={view} onViewChange={(v) => navigate({ search: { view: v } })} />
}
