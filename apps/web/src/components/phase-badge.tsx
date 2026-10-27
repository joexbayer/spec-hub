import type { Phase } from '@spec-hub/core'
import { phaseLabel } from '@spec-hub/core'
import { cn } from '@/lib/utils'

export const PHASE_DOT: Record<Phase['kind'], string> = {
  specify: 'bg-phase-specify',
  clarify: 'bg-phase-clarify',
  plan: 'bg-phase-plan',
  tasks: 'bg-phase-tasks',
  implement: 'bg-phase-implement',
  implemented: 'bg-phase-implemented',
}

export function PhaseBadge({ phase, className }: { phase: Phase; className?: string }) {
  return (
    <span
      data-slot="phase-badge"
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border bg-card px-2 text-xs font-medium whitespace-nowrap shadow-xs',
        className,
      )}
    >
      <span aria-hidden className={`size-2 rounded-full ${PHASE_DOT[phase.kind]}`} />
      {phaseLabel(phase)}
    </span>
  )
}
