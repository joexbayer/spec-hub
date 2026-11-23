import type { Board } from '@spec-hub/core'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, json } from '@/lib/api'

export type LastReportAt = Record<string, number>

export const isFinal = (err: unknown) => err instanceof ApiError && (err.status === 403 || err.status === 404)

// ['board', slug] holds the core Board (the command palette reads it);
// ['board', slug, 'reports'] is filled from the same response.
export function useBoard(slug: string) {
  const queryClient = useQueryClient()
  const board = useQuery({
    queryKey: ['board', slug],
    queryFn: async () => {
      const res = await json<{ board: Board; lastReportAt: LastReportAt; defaultBranch: string }>(
        await fetch(`/api/projects/${slug}/board`, { credentials: 'same-origin' }),
      )
      queryClient.setQueryData(['board', slug, 'reports'], res.lastReportAt)
      queryClient.setQueryData(['board', slug, 'defaultBranch'], res.defaultBranch)
      return res.board
    },
    // not a member, or no such project: polling cannot change that
    refetchInterval: (q) => (isFinal(q.state.error) ? false : 10_000),
    refetchIntervalInBackground: false,
    retry: (count, err) => !isFinal(err) && count < 1,
  })
  const reports = useQuery<LastReportAt>({
    queryKey: ['board', slug, 'reports'],
    queryFn: skipToken,
  })
  const branch = useQuery<string>({
    queryKey: ['board', slug, 'defaultBranch'],
    queryFn: skipToken,
  })
  return { board, lastReportAt: reports.data ?? {}, defaultBranch: branch.data }
}
