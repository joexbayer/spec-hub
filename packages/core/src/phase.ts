import type { FeatureVersion, Phase, PhaseKind } from './types.ts'

export const PHASE_ORDER: readonly PhaseKind[] = [
  'specify',
  'clarify',
  'plan',
  'tasks',
  'implement',
  'implemented',
]

// FR-013: first match wins.
export function inferPhase(v: Pick<FeatureVersion, 'spec' | 'plan' | 'tasks'>): Phase {
  if (v.spec && v.spec.openClarifications > 0) return { kind: 'clarify', open: v.spec.openClarifications }
  if (v.tasks && v.tasks.tasksDone > 0) {
    const { tasksDone: done, tasksTotal: total } = v.tasks
    return done === total ? { kind: 'implemented', total } : { kind: 'implement', done, total }
  }
  if (v.tasks) return { kind: 'tasks', total: v.tasks.tasksTotal }
  if (v.plan) return { kind: 'plan' }
  return { kind: 'specify' }
}

export function phaseLabel(p: Phase): string {
  switch (p.kind) {
    case 'specify':
      return 'Specify'
    case 'clarify':
      return `Clarify (${p.open})`
    case 'plan':
      return 'Plan'
    case 'tasks':
      return `Tasks (0/${p.total})`
    case 'implement':
      return `Implement ${p.done}/${p.total}`
    case 'implemented':
      return `Implemented ${p.total}/${p.total}`
  }
}
