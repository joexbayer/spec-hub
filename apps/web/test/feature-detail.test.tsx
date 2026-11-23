import type { ShownDoc, ShownVersion } from '@spec-hub/server/board-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentTabs } from '@/features/feature-detail/document-tabs'
import { FeaturePage } from '@/features/feature-detail/feature-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

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
    const { rerender } = render(<DocumentTabs slug="acme" shown={shown} tab="spec" onTabChange={() => {}} />)
    expect(screen.getByText('Hello spec')).toBeTruthy()
    rerender(<DocumentTabs slug="acme" shown={shown} tab="plan" onTabChange={() => {}} />)
    expect(screen.getByText('This branch has no plan.md yet.')).toBeTruthy()
    rerender(<DocumentTabs slug="acme" shown={shown} tab="tasks" onTabChange={() => {}} />)
    expect(screen.getByText('Too large to display (9999999 bytes). Read it in the repository.')).toBeTruthy()
  })

  it('reports tab changes', () => {
    const onTabChange = vi.fn()
    render(<DocumentTabs slug="acme" shown={shown} tab="spec" onTabChange={onTabChange} />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'plan' }))
    fireEvent.click(screen.getByRole('tab', { name: 'plan' }))
    expect(onTabChange).toHaveBeenCalledWith('plan')
  })
})

describe('FeaturePage with a finished feature', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  const finished = {
    dir: '001-a',
    number: '001',
    title: 'Finished title',
    owner: { kind: 'handle', handle: 'ana' },
    landedAt: Date.now() - 1000,
    lastChangeAt: Date.now() - 1000,
    tasks: { done: 3, total: 4 },
    reported: true,
    inFlight: false,
  }
  const landed = { dir: '001-a', firstSeenAt: 1, baseline: false, branch: 'main', finished }

  function renderPage(detail: unknown, onBranchChange = vi.fn()) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const body = url.includes('/features/')
          ? detail
          : { inFlight: [], stale: [], recentlyLanded: [], landedDirs: [], members: [] }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FeaturePage
          slug="demo"
          dir="001-a"
          tab="spec"
          branch={undefined}
          onTabChange={() => {}}
          onBranchChange={onBranchChange}
        />
      </QueryClientProvider>,
    )
    return onBranchChange
  }

  it('offers the landed default branch next to an in-flight branch', async () => {
    const version = {
      branch: '001-a',
      carrierUserId: 'u1',
      pushed: true,
      lastChangeAt: 5,
      spec: null,
      plan: null,
      tasks: null,
    }
    const onBranchChange = renderPage({
      entry: null,
      landed,
      versions: [version],
      shown: { branch: '001-a', docs: { spec: null, plan: null, tasks: null } },
    })
    // jsdom lacks the pointer-capture and scroll APIs Radix Select calls.
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
    Element.prototype.scrollIntoView = () => {}
    const trigger = await screen.findByRole('combobox', { name: 'Branch' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(trigger)
    const option = await screen.findByRole('option', { name: 'main (landed)' })
    fireEvent.click(option)
    expect(onBranchChange).toHaveBeenCalledWith('main')
  })

  it('renders a finished-only feature with badge, owner and title', async () => {
    renderPage({
      entry: null,
      landed,
      versions: [],
      shown: { branch: 'main', docs: { spec: null, plan: null, tasks: null } },
    })
    expect(await screen.findByText('Finished title')).toBeTruthy()
    expect(screen.getAllByText('Landed').length).toBeGreaterThan(0)
    expect(screen.getAllByText('@ana').length).toBeGreaterThan(0)
    expect(screen.queryByText('Not pushed')).toBeNull()
  })

  it('says documents are not reported when none were', async () => {
    renderPage({
      entry: null,
      landed: { ...landed, finished: { ...finished, reported: false } },
      versions: [],
      shown: null,
    })
    expect(await screen.findByText(/Documents not reported yet/)).toBeTruthy()
  })
})
