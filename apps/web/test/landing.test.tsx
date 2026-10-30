import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { LandingPage } from '@/features/landing/landing-page'
import type { LandingView } from '@/features/landing/landing-query'

afterEach(() => vi.unstubAllGlobals())

const now = Date.now()
const view: LandingView = {
  defaultBranch: 'main',
  holder: { id: 7, login: 'ana', startedAt: now - 120_000, minutes: 2 },
  waiting: [
    { id: 8, login: 'bob', askedAt: now - 60_000, position: 1, etaMinutes: 5, mine: false },
    { id: 9, login: 'cy', askedAt: now - 30_000, position: 2, etaMinutes: 10, mine: true },
  ],
  history: [
    {
      id: 3,
      login: 'dee',
      startedAt: now - 600_000,
      endedAt: now - 300_000,
      outcome: 'removed',
      endedBy: 'ana',
    },
  ],
  minutesPerTurn: 5,
}

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function renderPage(body: LandingView) {
  const fetchMock = vi.fn(async () => reply(body))
  vi.stubGlobal('fetch', fetchMock)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <LandingPage slug="acme" />
    </QueryClientProvider>,
  )
  return fetchMock
}

test('shows the holder, the queue in order with estimates, and who ended past turns', async () => {
  renderPage(view)
  expect(await screen.findByText(/holds the lock for 2 min/)).toBeTruthy()
  const rows = screen.getAllByRole('row').map((r) => r.textContent ?? '')
  expect(rows.findIndex((t) => t.includes('@bob'))).toBeLessThan(
    rows.findIndex((t) => t.includes('@cy (you)')),
  )
  expect(screen.getByText('about 10 min')).toBeTruthy()
  expect(screen.getByText('by @ana')).toBeTruthy()
  expect(screen.getByText('removed')).toBeTruthy()
})

test('open lock asks to confirm, then posts to the end route', async () => {
  const fetchMock = renderPage(view)
  fireEvent.click(await screen.findByRole('button', { name: 'Open lock' }))
  expect(await screen.findByText(/Their agent is told the next time it calls/)).toBeTruthy()
  const calls = () => fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>
  expect(calls().some(([, init]) => init?.method === 'POST')).toBe(false)
  fireEvent.click(screen.getAllByRole('button', { name: 'Open lock' }).at(-1) as HTMLElement)
  await waitFor(() =>
    expect(calls().find(([, init]) => init?.method === 'POST')?.[0]).toBe('/api/projects/acme/landing/7/end'),
  )
})

test('a free lock says so', async () => {
  renderPage({ ...view, holder: null, waiting: [] })
  expect(await screen.findByText('The lock is free')).toBeTruthy()
})
