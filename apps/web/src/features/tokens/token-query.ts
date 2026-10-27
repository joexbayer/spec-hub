import { queryOptions } from '@tanstack/react-query'
import { json } from '@/lib/api'

export type TokenRow = {
  id: string
  name: string
  start: string | null
  createdAt: string
  lastRequest: string | null
}

export const tokensQuery = queryOptions({
  queryKey: ['tokens'],
  queryFn: async () => json<TokenRow[]>(await fetch('/api/tokens', { credentials: 'same-origin' })),
})
