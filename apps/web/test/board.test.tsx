import type { Board, BoardEntry } from '@spec-hub/core'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function withClient(ui: React.ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
}

import { BoardStats } from '@/features/board/board-stats'
import { FeatureList } from '@/features/board/feature-list'
import { SideRail } from '@/features/board/side-rail'

// The list links with the typed router Link; a bare anchor stands in so no router is needed.
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    className,
    params,
    search,
  }: {
    children: React.ReactNode
    className?: string
    params?: { slug: string; dir: string }
    search?: { branch: string }
  }) => (
    <a
      href={params ? `/p/${params.slug}/f/${params.dir}${search ? `?branch=${search.branch}` : ''}` : '/'}
      className={className}
    >
      {children}
    </a>
  ),
}))

const base: BoardEntry = {
  dir: '001-a',
  number: '001',
  title: 'Alpha feature',
  owner: { kind: 'handle', handle: 'ana' },
  phase: { kind: 'implement', done: 2, total: 5 },
  openClarifications: 0,
  dependsOn: [],
  branches: [{ branch: '001-a', pushed: true, lastChangeAt: 0, carrierUserId: 'u1' }],
  lastChangeAt: Date.now(),
  changesLandedFeature: false,
  collisions: [],
}

const board: Board = {
  inFlight: [
    base,
    {
      ...base,
      dir: '002-b',
      number: '002',
      title: 'Beta feature',
      phase: { kind: 'plan' },
      dependsOn: ['009-missing'],
      collisions: ['002-c'],
    },
  ],
  stale: [],
  recentlyLanded: [],
  landedDirs: [],
  members: [],
}

function tile(label: string) {
  return screen.getByText(label).closest('[data-slot="stat-tile"]') as HTMLElement
}

test('stat strip counts and list titles', () => {
  render(
    withClient(
      <>
        <BoardStats board={board} />
        <FeatureList slug="demo" inFlight={board.inFlight} stale={[]} />
      </>,
    ),
  )
  expect(within(tile('In flight')).getByText('2')).toBeTruthy()
  expect(within(tile('Blocked')).getByText('1')).toBeTruthy()
  expect(within(tile('Collisions')).getByText('1')).toBeTruthy()
  expect(screen.getByText('Alpha feature')).toBeTruthy()
})

test('a recently landed row links to its feature page', () => {
  render(
    <SideRail
      slug="demo"
      board={{ ...board, recentlyLanded: [{ dir: '004-delta', firstSeenAt: Date.now(), baseline: false }] }}
      lastReportAt={{}}
    />,
  )
  const link = screen.getByText('Delta').closest('a')
  expect(link?.getAttribute('href')).toBe('/p/demo/f/004-delta')
})

test('a recently landed row opens the default branch version when known', () => {
  render(
    <SideRail
      slug="demo"
      board={{ ...board, recentlyLanded: [{ dir: '004-delta', firstSeenAt: Date.now(), baseline: false }] }}
      lastReportAt={{}}
      defaultBranch="main"
    />,
  )
  expect(screen.getByText('Delta').closest('a')?.getAttribute('href')).toBe('/p/demo/f/004-delta?branch=main')
})

test('the team panel shows who has not connected and who has not signed in yet', () => {
  render(
    <SideRail
      slug="demo"
      board={{ ...board, members: [{ userId: 'u1', githubLogin: 'ana', name: 'Ana', image: null }] }}
      lastReportAt={{}}
      pending={['later']}
    />,
  )
  expect(screen.getByText('Not connected yet')).toBeTruthy()
  expect(screen.getByText('@later')).toBeTruthy()
  expect(screen.getByText("Added, hasn't signed in yet")).toBeTruthy()
})

test('right-clicking a row offers Copy link and Hide per branch', async () => {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 201 }))
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(withClient(<FeatureList slug="demo" inFlight={board.inFlight} stale={[]} />))

  const row = () => screen.getByText('Alpha feature').closest('tr') as HTMLElement
  fireEvent.contextMenu(row())
  fireEvent.click(await screen.findByText('Copy link'))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/p/demo/f/001-a`))

  fireEvent.contextMenu(row())
  fireEvent.click(await screen.findByText('001-a', { selector: 'span.font-mono' }))
  await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
  expect(url).toBe('/api/projects/demo/hidden-branches')
  expect(JSON.parse(String(init.body))).toEqual({ branch: '001-a' })
})
