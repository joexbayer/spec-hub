import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { WaitingPage } from '@/features/access/waiting-page'
import { CreateProjectDialog } from '@/features/admin/create-project-dialog'
import { MembersTab } from '@/features/admin/members-tab'
import { assignable, type Person } from '@/features/admin/people'
import { detailText } from '@/features/admin/security-log-tab'
import { SettingsTab } from '@/features/admin/settings-tab'

// Radix Switch measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

afterEach(() => vi.unstubAllGlobals())

test('create-project form rejects an invalid slug without calling fetch', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<CreateProjectDialog onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /create project/i }))
  fireEvent.change(await screen.findByLabelText('Slug'), { target: { value: 'Bad Slug!' } })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Demo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByText(/lowercase letters/)).toBeTruthy()
  await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
})

test('create-project form rejects a branch name the hub would refuse, in the field', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  render(<CreateProjectDialog onCreated={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: /create project/i }))
  fireEvent.change(await screen.findByLabelText('Slug'), { target: { value: 'demo' } })
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Demo' } })
  fireEvent.change(screen.getByLabelText('Default branch'), { target: { value: 'release 1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create' }))
  expect(await screen.findByText('Not a valid branch name')).toBeTruthy()
  await waitFor(() => expect(fetchMock).not.toHaveBeenCalled())
})

test('security event details render as plain key: value text', () => {
  expect(detailText({ githubLogin: 'ana', role: 'admin' })).toBe('githubLogin: ana, role: admin')
})

const person = (id: string, waiting = false): Person => ({
  id,
  githubLogin: id,
  name: id,
  image: null,
  waiting,
  lastSignInAt: null,
})

test('add member suggests only signed-in people who are not members yet', () => {
  const people = [person('ann'), person('bob', true), person('cy'), person('dee')]
  const members = [
    { userId: 'ann', githubLogin: 'ann' },
    { userId: 'cy', githubLogin: 'cy' },
    // pending: no hub user yet, matched by login
    { userId: null, githubLogin: 'Dee' },
  ]
  expect(assignable(people, members).map((p) => p.id)).toEqual(['bob'])
  expect(assignable(people, [])).toHaveLength(4)
})

test('add member posts the typed username and shows the hub error inline', async () => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') return json(404, { error: 'no GitHub user @ghost' })
    if (url.endsWith('/members')) {
      return json(200, [
        {
          githubId: '7',
          githubLogin: 'later',
          userId: null,
          role: 'member',
          name: null,
          image: null,
          pending: true,
        },
      ])
    }
    return json(200, [])
  })
  vi.stubGlobal('fetch', fetchMock)
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MembersTab slug="demo" />
    </QueryClientProvider>,
  )
  expect(await screen.findByText(/Pending/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('GitHub username'), { target: { value: '@ghost' } })
  fireEvent.click(screen.getByRole('button', { name: /add member/i }))
  expect((await screen.findByRole('alert')).textContent).toContain('no GitHub user @ghost')
  const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')
  expect(JSON.parse(String(post?.[1]?.body))).toEqual({ githubLogin: 'ghost', role: 'member' })
})

test('the waiting page shows the login to give an admin and signs out', () => {
  const onSignOut = vi.fn()
  render(<WaitingPage login="newdev" onSignOut={onSignOut} />)
  expect(screen.getByText('Waiting for access')).toBeTruthy()
  expect(screen.getByText('@newdev')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
  expect(onSignOut).toHaveBeenCalledOnce()
})

test('removing a member refreshes me, so a removed or demoted admin loses admin views', async () => {
  const res = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return new Response(null, { status: 204 })
      if (url.endsWith('/members')) {
        return res(200, [
          {
            githubId: '1',
            githubLogin: 'me',
            userId: 'u1',
            role: 'admin',
            name: null,
            image: null,
            pending: false,
          },
        ])
      }
      return res(200, [])
    }),
  )
  const client = new QueryClient()
  client.setQueryData(['me'], { projects: [] })
  render(
    <QueryClientProvider client={client}>
      <MembersTab slug="demo" />
    </QueryClientProvider>,
  )
  fireEvent.click(await screen.findByRole('button', { name: 'Remove me' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Remove' }))
  await waitFor(() => expect(client.getQueryState(['me'])?.isInvalidated).toBe(true))
})

test('settings tab shows the share-pushed-branches switch and sends it in the PATCH body', async () => {
  const project = {
    slug: 'demo',
    name: 'Demo',
    defaultBranch: 'main',
    numbering: 'sequential',
    sharePushedBranches: false,
    createdAt: '2026-01-01',
  }
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.method === 'PATCH' ? { ...project, sharePushedBranches: true } : project
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SettingsTab slug="demo" />
    </QueryClientProvider>,
  )
  const toggle = await screen.findByRole('switch', { name: 'Share pushed branches' })
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => {
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ sharePushedBranches: true })
  })
})
