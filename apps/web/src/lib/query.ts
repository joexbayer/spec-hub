import { QueryClient, queryOptions } from '@tanstack/react-query'
import { json } from './api'

export type Me = {
  user: { id: string; githubLogin: string; name: string | null; image: string | null }
  isHubAdmin: boolean
  // not a hub admin and in no project: the app shows only the waiting page
  waiting: boolean
  projects: { slug: string; name: string; role: string }[]
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } },
})

export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: async () => json<Me>(await fetch('/api/me', { credentials: 'same-origin' })),
})
