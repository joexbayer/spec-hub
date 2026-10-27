import type { BoardEntry } from '@spec-hub/core'
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { FeatureCard } from '@/components/feature-card'
import { ChartContainer } from '@/components/ui/chart'

const entry: BoardEntry = {
  dir: '007-search',
  number: '007',
  title: 'Search <b>everything</b>',
  owner: { kind: 'handle', handle: 'ana' },
  phase: { kind: 'implement', done: 7, total: 19 },
  openClarifications: 0,
  dependsOn: ['003'],
  branches: [{ branch: '007-search', pushed: false, lastChangeAt: 0, carrierUserId: 'u1' }],
  lastChangeAt: 0,
  changesLandedFeature: false,
  collisions: ['007-other'],
}

test('FeatureCard shows state badges as text', () => {
  render(<FeatureCard entry={entry} blocked blockedBy={['003']} />)
  expect(screen.getByText('Blocked')).toBeTruthy()
  expect(screen.getByText('Number collision')).toBeTruthy()
  expect(screen.getByText('Not pushed')).toBeTruthy()
  expect(screen.getByText('Implement 7/19')).toBeTruthy()
  expect(screen.getByText('Search <b>everything</b>')).toBeTruthy()
})

test('compact FeatureCard has a fixed height so graph layout is true', () => {
  const { container } = render(<FeatureCard entry={entry} blocked blockedBy={['003']} size="compact" />)
  const card = container.querySelector('.h-28')
  expect(card).toBeTruthy()
  expect(card?.className).toContain('overflow-hidden')
})

test('chart config injects resolvable --color-* vars from the --phase-* tokens', () => {
  const { container } = render(
    <ChartContainer config={{ plan: { label: 'Plan', color: 'var(--phase-plan)' } }}>
      <div />
    </ChartContainer>,
  )
  expect(container.querySelector('style')?.innerHTML).toContain('--color-plan: var(--phase-plan);')
})
