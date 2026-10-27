import { describe, expect, it } from 'vitest'
import { inferPhase, PHASE_ORDER, phaseLabel } from '../src/phase.ts'
import type { DocFacts } from '../src/types.ts'

const doc = (o: Partial<DocFacts> = {}): DocFacts => ({
  title: null,
  ownerHandle: null,
  dependsOn: [],
  openClarifications: 0,
  tasksDone: 0,
  tasksTotal: 0,
  tooLarge: false,
  unreadable: false,
  ...o,
})

describe('inferPhase', () => {
  it('nothing -> specify', () => {
    expect(inferPhase({ spec: null, plan: null, tasks: null })).toEqual({ kind: 'specify' })
    expect(inferPhase({ spec: doc(), plan: null, tasks: null })).toEqual({ kind: 'specify' })
  })
  it('plan only -> plan', () => {
    expect(inferPhase({ spec: doc(), plan: doc(), tasks: null })).toEqual({ kind: 'plan' })
  })
  it('tasks with 0 done -> tasks', () => {
    expect(inferPhase({ spec: doc(), plan: doc(), tasks: doc({ tasksTotal: 19 }) })).toEqual({
      kind: 'tasks',
      total: 19,
    })
  })
  it('some done -> implement', () => {
    expect(inferPhase({ spec: doc(), plan: doc(), tasks: doc({ tasksDone: 7, tasksTotal: 19 }) })).toEqual({
      kind: 'implement',
      done: 7,
      total: 19,
    })
  })
  it('all done -> implemented', () => {
    expect(inferPhase({ spec: doc(), plan: doc(), tasks: doc({ tasksDone: 19, tasksTotal: 19 }) })).toEqual({
      kind: 'implemented',
      total: 19,
    })
  })
  it('clarify beats tasks done', () => {
    expect(
      inferPhase({
        spec: doc({ openClarifications: 2 }),
        plan: doc(),
        tasks: doc({ tasksDone: 3, tasksTotal: 5 }),
      }),
    ).toEqual({ kind: 'clarify', open: 2 })
  })
  it('tasks without plan still tasks', () => {
    expect(inferPhase({ spec: null, plan: null, tasks: doc({ tasksTotal: 4 }) })).toEqual({
      kind: 'tasks',
      total: 4,
    })
  })
})

describe('phaseLabel', () => {
  it('formats every phase', () => {
    expect(phaseLabel({ kind: 'specify' })).toBe('Specify')
    expect(phaseLabel({ kind: 'clarify', open: 2 })).toBe('Clarify (2)')
    expect(phaseLabel({ kind: 'plan' })).toBe('Plan')
    expect(phaseLabel({ kind: 'tasks', total: 19 })).toBe('Tasks (0/19)')
    expect(phaseLabel({ kind: 'implement', done: 7, total: 19 })).toBe('Implement 7/19')
    expect(phaseLabel({ kind: 'implemented', total: 19 })).toBe('Implemented 19/19')
  })
  it('PHASE_ORDER lists all kinds', () => {
    expect(PHASE_ORDER).toHaveLength(6)
  })
})
