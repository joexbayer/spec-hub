import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ConnectLanes } from '@/features/connect/connect-lanes'
import type { ConnectInfo } from '@/features/connect/connect-query'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/">{children}</a>,
}))

afterEach(cleanup)

const info = (over: Partial<ConnectInfo> = {}): ConnectInfo => ({
  hubUrl: 'https://hub',
  slug: 'demo',
  mcpUrl: 'https://hub/mcp/demo',
  installCommand: 'specify extension add spec-hub --from https://hub/extension/spec-hub.zip',
  configSnippet: 'hub_url: https://hub\nproject: demo\n',
  clones: [],
  projectReported: true,
  agentSeenAt: null,
  ...over,
})
const clone = { id: 'c1', reportedAt: new Date().toISOString(), features: 3 }
const show = (over?: Partial<ConnectInfo>) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConnectLanes info={info(over)} />
    </QueryClientProvider>,
  )
const tab = (name: string) => screen.getByRole('tab', { name })
const pick = (name: string) => {
  fireEvent.mouseDown(tab(name))
  fireEvent.click(tab(name))
}

test('opens on Connect yourself once the project has reported, and the lanes switch', () => {
  show({ projectReported: true })
  expect(tab('Connect yourself').getAttribute('aria-selected')).toBe('true')
  pick('Set up the repository')
  expect(tab('Set up the repository').getAttribute('aria-selected')).toBe('true')
})

test('opens on Set up the repository before any report; "Now connect yourself" switches', () => {
  show({ projectReported: false })
  expect(tab('Set up the repository').getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('button', { name: /Now connect yourself/ }))
  expect(tab('Connect yourself').getAttribute('aria-selected')).toBe('true')
  expect(screen.getByText('Create a token')).toBeTruthy()
})

test('the yourself lane has no setup commands; the setup lane has install, mcp and commit', () => {
  show({ projectReported: true })
  expect(screen.queryByText(info().installCommand)).toBeNull()
  expect(screen.queryByText(/git commit/)).toBeNull()
  pick('Set up the repository')
  expect(screen.getByText(info().installCommand)).toBeTruthy()
  expect(screen.getByText('sh .specify/extensions/spec-hub/scripts/spec-hub mcp')).toBeTruthy()
  expect(
    screen.getByText(
      'git add .specify/extensions/spec-hub .mcp.json .claude/settings.json && git commit -m "Connect Spec Hub"',
    ),
  ).toBeTruthy()
})

test('step 2 ticks with a clone; step 3 ticks when the hub saw the agent', () => {
  show({ clones: [clone], agentSeenAt: new Date().toISOString() })
  expect(screen.getByLabelText('Step 2 done')).toBeTruthy()
  expect(screen.getByText('3 features reported')).toBeTruthy()
  expect(screen.getByLabelText('Step 3 done')).toBeTruthy()
  expect(screen.getByText(/Your agent called the hub/)).toBeTruthy()
  expect(screen.getByText('3 of 3 done')).toBeTruthy()
})

test('nothing is ticked before the hub has seen anything', () => {
  show()
  expect(screen.getByLabelText('Step 1 to do')).toBeTruthy()
  expect(screen.getByLabelText('Step 2 to do')).toBeTruthy()
  expect(screen.getByLabelText('Step 3 to do')).toBeTruthy()
  expect(screen.queryByText(/called the hub/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()
})

test('no personal claude mcp add entry anywhere; troubleshooting gives status and mcp-headers', () => {
  const { container } = show()
  expect(container.textContent).not.toMatch(/claude mcp add/)
  expect(container.textContent).not.toMatch(/SPEC_HUB_TOKEN/)
  pick('Set up the repository')
  expect(container.textContent).not.toMatch(/claude mcp add/)
  expect(screen.getByText('sh .specify/extensions/spec-hub/scripts/spec-hub status')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Failed to connect/ }))
  expect(
    screen.getByText(
      'CLAUDE_CODE_MCP_SERVER_URL=https://hub/mcp/demo sh .specify/extensions/spec-hub/scripts/spec-hub mcp-headers',
    ),
  ).toBeTruthy()
})
