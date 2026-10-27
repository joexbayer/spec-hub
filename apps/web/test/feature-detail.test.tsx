import type { ShownDoc, ShownVersion } from '@spec-hub/server/board-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentTabs } from '@/features/feature-detail/document-tabs'

vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg></svg>' })) },
}))

const facts = {
  title: 't',
  ownerHandle: null,
  dependsOn: [],
  openClarifications: 0,
  tasksDone: 0,
  tasksTotal: 0,
  tooLarge: false,
  unreadable: false,
}

const doc = (over: Partial<ShownDoc>): ShownDoc => ({
  oid: 'abcdef123456',
  size: 10,
  content: null,
  tooLarge: false,
  unreadable: false,
  facts,
  ...over,
})

const shown = {
  branch: 'b',
  docs: {
    spec: doc({ content: '# Hello spec' }),
    plan: null,
    tasks: doc({ size: 9999999, tooLarge: true }),
  },
} as unknown as ShownVersion

describe('DocumentTabs', () => {
  afterEach(cleanup)

  it('renders content, missing and too-large messages', () => {
    const { rerender } = render(<DocumentTabs shown={shown} tab="spec" onTabChange={() => {}} />)
    expect(screen.getByText('Hello spec')).toBeTruthy()
    rerender(<DocumentTabs shown={shown} tab="plan" onTabChange={() => {}} />)
    expect(screen.getByText('This branch has no plan.md yet.')).toBeTruthy()
    rerender(<DocumentTabs shown={shown} tab="tasks" onTabChange={() => {}} />)
    expect(screen.getByText('Too large to display (9999999 bytes). Read it in the repository.')).toBeTruthy()
  })

  it('reports tab changes', () => {
    const onTabChange = vi.fn()
    render(<DocumentTabs shown={shown} tab="spec" onTabChange={onTabChange} />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'plan' }))
    fireEvent.click(screen.getByRole('tab', { name: 'plan' }))
    expect(onTabChange).toHaveBeenCalledWith('plan')
  })
})
