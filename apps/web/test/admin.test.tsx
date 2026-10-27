import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { WaitingPage } from '@/features/access/waiting-page'
import { CreateProjectDialog } from '@/features/admin/create-project-dialog'
import { MembersTab } from '@/features/admin/members-tab'
import { assignable, type Person } from '@/features/admin/people'
import { detailText } from '@/features/admin/security-log-tab'

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
