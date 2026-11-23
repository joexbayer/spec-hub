import type { FinishedFeature } from '@spec-hub/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { FinishedList } from '@/features/finished/finished-page'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    search,
  }: {
    children: React.ReactNode
    params: { dir: string }
    search: { branch: string }
  }) => <a href={`/p/demo/f/${params.dir}?branch=${search.branch}`}>{children}</a>,
}))

afterEach(cleanup)

const f = (dir: string, number: string, title: string, handle: string, extra = {}): FinishedFeature => ({
  dir,
  number,
  title,
  owner: { kind: 'handle', handle },
  landedAt: 1_700_000_000_000,
  lastChangeAt: null,
  tasks: null,
  reported: true,
  inFlight: false,
  ...extra,
})

const finished = [
  f('003-gamma', '003', 'Gamma thing', 'ana'),
  f('012-alpha', '012', 'Alpha 003 mention', 'bo', { landedAt: null, reported: false }),
  f('001-beta', '001', 'Beta', 'ana', { tasks: { done: 2, total: 4 }, inFlight: true }),
]
const data = { defaultBranch: 'main', finishedTipAt: null as number | null, finished }
const titles = () => screen.getAllByRole('link').map((a) => a.textContent)

const view = (props: { q?: string; owner?: string; data?: typeof data }) =>
  render(
    <FinishedList
      slug="demo"
      data={props.data ?? data}
      q={props.q}
      owner={props.owner}
      onChange={() => {}}
    />,
  )

test('rows in given order with their details and the branch link', () => {
  view({})
  const links = screen.getAllByRole('link')
  expect(links.map((a) => a.textContent)).toEqual([
    expect.stringContaining('Gamma thing'),
    expect.stringContaining('Alpha 003 mention'),
    expect.stringContaining('Beta'),
  ])
  expect(links[0]?.getAttribute('href')).toBe('/p/demo/f/003-gamma?branch=main')
  expect(screen.getByText('landing time unknown')).toBeTruthy()
  expect(screen.getByText('documents not reported yet')).toBeTruthy()
  expect(screen.getByText('2/4')).toBeTruthy()
  expect(screen.getByText('In flight again')).toBeTruthy()
})

test('query filters and an exact number comes first', () => {
  view({ q: '003' })
  const t = titles()
  expect(t).toHaveLength(2)
  expect(t[0]).toContain('Gamma thing')
  expect(t[1]).toContain('Alpha 003 mention')
})

test('owner filter narrows', () => {
  view({ owner: 'bo' })
  expect(titles()).toHaveLength(1)
  expect(titles()[0]).toContain('Alpha')
})

test('empty states', () => {
  view({ data: { ...data, finished: [] } })
  expect(screen.getByText('No finished features yet')).toBeTruthy()
})

test('no match offers clearing filters', () => {
  view({ q: 'zzz' })
  expect(screen.getByText('No finished feature matches')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Clear filters' })).toBeTruthy()
})

test('an owner that matches nobody stays selected', () => {
  view({ owner: 'ghost' })
  expect(screen.getByRole('combobox', { name: 'Owner' }).textContent).toBe('ghost')
  expect(screen.getByText('No finished feature matches')).toBeTruthy()
})
