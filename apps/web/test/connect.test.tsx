import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ConnectChecklist } from '@/features/connect/connect-checklist'

const base = {
  mcpUrl: 'https://hub/mcp',
  agentDone: false,
  install: {
    installCommand: 'specify extension add spec-hub --from https://hub/extension/spec-hub.zip',
    configSnippet: 'hub_url: https://hub\nproject: demo\n',
  },
  onCreated: () => {},
  onAgentDone: () => {},
}
const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
)

test('step 4 shows the placeholder before a key and the key after', () => {
  const { rerender } = render(wrap(<ChecklistWith tokenKey={null} />))
  expect(screen.getByText(/Bearer <your token>/)).toBeTruthy()
  act(() => rerender(wrap(<ChecklistWith tokenKey="sh_test" />)))
  expect(screen.getByText(/Bearer sh_test/)).toBeTruthy()
})

test('step 3 is ticked when a clone exists', () => {
  render(
    wrap(
      <ChecklistWith
        tokenKey={null}
        clones={[{ id: 'c1', reportedAt: new Date().toISOString(), features: 3 }]}
      />,
    ),
  )
  expect(screen.getByLabelText('Step 3 done')).toBeTruthy()
  expect(screen.getByText('3 features reported')).toBeTruthy()
})

test('step 3 offers the extension install, open until a clone reports', () => {
  const first = render(wrap(<ChecklistWith tokenKey={null} />))
  expect(within(first.container).getByText(base.install.installCommand)).toBeTruthy()
  expect(within(first.container).getByText(/project: demo/)).toBeTruthy()
  const later = render(
    wrap(
      <ChecklistWith
        tokenKey={null}
        clones={[{ id: 'c1', reportedAt: new Date().toISOString(), features: 1 }]}
      />,
    ),
  )
  expect(within(later.container).getByText('First time in this repository?')).toBeTruthy()
  expect(within(later.container).queryByText(base.install.installCommand)).toBeNull()
})

function ChecklistWith(p: {
  tokenKey: string | null
  clones?: { id: string; reportedAt: string; features: number }[]
}) {
  return <ConnectChecklist {...base} tokenKey={p.tokenKey} clones={p.clones ?? []} />
}
