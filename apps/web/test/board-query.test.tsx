import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { isFinal, useBoard } from '@/features/board/board-query'

afterEach(() => vi.unstubAllGlobals())

test('the board stops asking once the hub says not a member', async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: 'not a member' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  const client = new QueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(() => useBoard('demo'), { wrapper })
  await waitFor(() => expect(result.current.board.isError).toBe(true))
  expect(isFinal(result.current.board.error)).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(1) // not retried
})
