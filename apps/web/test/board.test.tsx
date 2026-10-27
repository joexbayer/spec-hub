import type { Board, BoardEntry } from '@spec-hub/core'
import { render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BoardStats } from '@/features/board/board-stats'
import { FeatureList } from '@/features/board/feature-list'

// The list links with the typed router Link; a bare anchor stands in so no router is needed.
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <a href="/" className={className}>
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
