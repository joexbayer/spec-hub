import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { copyLink, featureUrl } from '@/features/done/copy-link'
import { useMarkDone } from '@/features/done/use-mark-done'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function setup(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const qc = new QueryClient()
  const invalidate = vi.spyOn(qc, 'invalidateQueries')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  )
  return { invalidate, ...renderHook(() => useMarkDone('my proj'), { wrapper }) }
}

test('mark posts to the feature done route, invalidates board and feature, and offers Undo', async () => {
  const fetchMock = vi.fn(async () => new Response('{"dir":"006-x","versions":{}}', { status: 200 }))
  const { result, invalidate } = setup(fetchMock)
  await act(() => result.current.mark.mutateAsync({ dir: '006-x', title: 'X' }))
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/projects/my%20proj/features/006-x/done')
  expect(init.method).toBe('POST')
  expect(invalidate.mock.calls.map(([f]) => f?.queryKey)).toEqual([
    ['board', 'my proj'],
    ['feature', 'my proj'],
  ])
  expect(toast.mock.calls[0]?.[0]).toBe('Marked X as done.')
  // Undo issues the DELETE
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }))
  const opts = toast.mock.calls[0]?.[1] as { action: { onClick: () => void } }
  act(() => opts.action.onClick())
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  const [delUrl, delInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
  expect(delUrl).toBe('/api/projects/my%20proj/features/006-x/done')
  expect(delInit.method).toBe('DELETE')
  await waitFor(() => expect(toast).toHaveBeenCalledWith('006-x is back on the board.'))
})

test('mark failure shows the hub error', async () => {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: 'no such feature in flight' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }),
  )
  const { result } = setup(fetchMock)
  await act(() => result.current.mark.mutateAsync({ dir: 'x', title: 'X' }).catch(() => {}))
  expect(toast.error).toHaveBeenCalledWith('no such feature in flight')
})

test('copyLink writes the url to the clipboard and toasts', async () => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  await copyLink('http://x/p/a/f/b')
  expect(writeText).toHaveBeenCalledWith('http://x/p/a/f/b')
  expect(toast).toHaveBeenCalledWith('Link copied')
})

test('copyLink toasts an error when the clipboard is missing or rejects', async () => {
  vi.stubGlobal('navigator', {})
  await copyLink('u')
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => Promise.reject(new Error('no'))) } })
  await copyLink('u')
  expect(toast.error).toHaveBeenCalledTimes(2)
  expect(toast.error).toHaveBeenCalledWith('Could not copy the link')
})

test('featureUrl encodes slug and dir', () => {
  expect(featureUrl('a b', '006-x')).toBe(`${window.location.origin}/p/a%20b/f/006-x`)
})
