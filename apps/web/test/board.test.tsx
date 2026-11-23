import type { Board, BoardEntry } from '@spec-hub/core'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(cleanup)

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
    <>
      <BoardStats board={board} />
      <FeatureList slug="demo" inFlight={board.inFlight} stale={[]} />
    </>,
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
