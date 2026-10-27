import type { Board } from '@spec-hub/core'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { json } from '@/lib/api'

export type LastReportAt = Record<string, number>

// ['board', slug] holds the core Board (the command palette reads it);
// ['board', slug, 'reports'] is filled from the same response.
export function useBoard(slug: string) {
  const queryClient = useQueryClient()
  const board = useQuery({
    queryKey: ['board', slug],
    queryFn: async () => {
      const res = await json<{ board: Board; lastReportAt: LastReportAt }>(
        await fetch(`/api/projects/${slug}/board`, { credentials: 'same-origin' }),
      )
      queryClient.setQueryData(['board', slug, 'reports'], res.lastReportAt)
      return res.board
    },
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  })
  const reports = useQuery<LastReportAt>({
    queryKey: ['board', slug, 'reports'],
    queryFn: skipToken,
  })
  return { board, lastReportAt: reports.data ?? {} }
}
