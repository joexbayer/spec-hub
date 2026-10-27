import { queryOptions } from '@tanstack/react-query'
import { json } from '@/lib/api'

export type Clone = { id: string; reportedAt: string; features: number }
export type ConnectInfo = {
  hubUrl: string
  slug: string
  mcpUrl: string
  installCommand: string
  configSnippet: string
  clones: Clone[]
}

export const connectQuery = (slug: string, poll: boolean) =>
  queryOptions({
    queryKey: ['connect', slug],
    queryFn: async () =>
      json<ConnectInfo>(await fetch(`/api/projects/${slug}/connect`, { credentials: 'same-origin' })),
    refetchInterval: poll ? 3000 : false,
  })
