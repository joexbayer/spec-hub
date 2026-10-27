import type { BoardEntry } from '@spec-hub/core'
import { PHASE_ORDER } from '@spec-hub/core'
import type { Edge, Node } from '@xyflow/react'
import { expect, test } from 'vitest'
import { CARD_H, CARD_W, dagreLayout, pipelineLayout } from '@/features/graphs/layout'

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
