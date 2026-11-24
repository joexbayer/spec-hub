import type { BoardEntry } from '@spec-hub/core'
import { PHASE_ORDER } from '@spec-hub/core'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { Edge, Node } from '@xyflow/react'
import { ReactFlowProvider } from '@xyflow/react'
import { afterEach, expect, test, vi } from 'vitest'
import { CARD_H, CARD_W, dagreLayout, pipelineLayout } from '@/features/graphs/layout'
import { BranchNode, PersonNode } from '@/features/graphs/nodes'

const size = () => ({ width: CARD_W, height: CARD_H })

test('dagreLayout lays a chain out left to right', () => {
  const nodes: Node[] = ['a', 'b', 'c'].map((id) => ({ id, position: { x: 0, y: 0 }, data: {} }))
  const edges: Edge[] = [
    { id: 'ab', source: 'a', target: 'b' },
    { id: 'bc', source: 'b', target: 'c' },
  ]
  const xs = dagreLayout(nodes, edges, size).map((n) => n.position.x) as [number, number, number]
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
})

const entry = (dir: string, kind: 'specify' | 'plan'): BoardEntry =>
  ({
    dir,
    number: dir.slice(0, 3),
    title: dir,
    owner: { kind: 'handle', handle: 'ana' },
    phase: kind === 'plan' ? { kind: 'plan' } : { kind: 'specify' },
    openClarifications: 0,
    dependsOn: [],
    branches: [],
    lastChangeAt: 0,
    changesLandedFeature: false,
    collisions: [],
  }) as BoardEntry

test('pipelineLayout puts entries in their phase column and stacks them', () => {
  const columns = [...PHASE_ORDER, 'landed' as const]
  const nodes = pipelineLayout(
    columns,
    [entry('001-a', 'plan'), entry('002-b', 'plan'), entry('003-c', 'specify')],
    [],
  )
  const get = (id: string) => nodes.find((n) => n.id === id)!
  expect(get('001-a').position.x).toBe(get('col-plan').position.x)
  expect(get('003-c').position.x).toBe(get('col-specify').position.x)
  expect(get('002-b').position.y).toBeGreaterThan(get('001-a').position.y)
})

test('pipelineLayout keeps a feature that is in flight again apart from its landed card', () => {
  const nodes = pipelineLayout(
    [...PHASE_ORDER, 'landed' as const],
    [entry('157-usage', 'plan')],
    [{ dir: '157-usage', firstSeenAt: 0, baseline: false }],
  )
  const ids = nodes.map((n) => n.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(nodes.find((n) => n.id === '157-usage')?.position.x).toBe(
    nodes.find((n) => n.id === 'col-plan')?.position.x,
  )
  // lanes sit under the edge layer so lines between lanes cross them visibly
  expect(nodes.filter((n) => n.type === 'column').every((n) => n.zIndex === -1)).toBe(true)
})

const props = {
  data: { owner: { kind: 'unknown' }, count: 2, shared: true },
  selected: false,
} as unknown as Parameters<typeof PersonNode>[0]

test('the work map labels the shared-remote person "Shared remote", not an avatar name', () => {
  render(
    <ReactFlowProvider>
      <PersonNode {...props} />
    </ReactFlowProvider>,
  )
  expect(screen.getByText('Shared remote')).toBeTruthy()
  expect(screen.queryByText('unknown')).toBeNull()
})

afterEach(cleanup)

const branchProps = (onHide?: () => void) =>
  ({
    data: { branch: 'ana/leftover', pushed: true, lastChangeAt: 0, onHide },
    selected: false,
  }) as unknown as Parameters<typeof BranchNode>[0]

test('a work-map branch opens a context menu whose item hides it', async () => {
  const onHide = vi.fn()
  render(
    <ReactFlowProvider>
      <BranchNode {...branchProps(onHide)} />
    </ReactFlowProvider>,
  )
  fireEvent.contextMenu(screen.getByText('ana/leftover'))
  fireEvent.click(await screen.findByText('Hide this branch'))
  expect(onHide).toHaveBeenCalledTimes(1)
})

test('a branch without onHide has no context menu', () => {
  render(
    <ReactFlowProvider>
      <BranchNode {...branchProps()} />
    </ReactFlowProvider>,
  )
  fireEvent.contextMenu(screen.getByText('ana/leftover'))
  expect(screen.queryByText('Hide this branch')).toBeNull()
})
