import { queryOptions } from '@tanstack/react-query'
import { json } from '@/lib/api'

export type Outcome = 'landed' | 'released' | 'expired' | 'skipped' | 'left' | 'removed'

export type LandingView = {
  defaultBranch: string
  holder: { id: number; login: string; startedAt: number; minutes: number } | null
  waiting: Array<{
    id: number
    login: string
    askedAt: number
    position: number
    etaMinutes: number
    mine: boolean
  }>
  history: Array<{
    id: number
    login: string
    startedAt: number | null
    endedAt: number
    outcome: Outcome
    endedBy: string | null
  }>
  minutesPerTurn: number
}

// The queue moves without the viewer doing anything, so the page polls.
const POLL_MS = 10_000

export const landingQuery = (slug: string) =>
  queryOptions({
    queryKey: ['landing', slug],
    queryFn: async () =>
      json<LandingView>(await fetch(`/api/projects/${slug}/landing`, { credentials: 'same-origin' })),
    refetchInterval: POLL_MS,
  })
