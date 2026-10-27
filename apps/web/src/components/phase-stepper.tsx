import type { Phase } from '@spec-hub/core'
import { PHASE_ORDER } from '@spec-hub/core'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

const LABELS = ['Specify', 'Clarify', 'Plan', 'Tasks', 'Implement', 'Implemented', 'Landed']

export function PhaseStepper({ phase, landed }: { phase: Phase; landed?: boolean }) {
  const current = landed ? LABELS.length - 1 : PHASE_ORDER.indexOf(phase.kind)
  return (
    <ol aria-label="Phase" className="flex min-w-[36rem] items-start">
      {LABELS.map((label, i) => {
        const done = i < current || (landed && i === current)
        const isCurrent = i === current && !landed
        return (
          <li
            key={label}
            aria-current={isCurrent ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-1.5 text-center text-xs"
          >
            {i < LABELS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'absolute top-3 left-[calc(50%+0.875rem)] h-px w-[calc(100%-1.75rem)]',
                  i < current ? 'bg-foreground/60' : 'bg-border',
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                'relative grid size-6 place-items-center rounded-full border text-[11px] tabular-nums',
                done && 'border-transparent bg-primary text-primary-foreground',
                isCurrent && 'border-foreground bg-background font-semibold ring-4 ring-foreground/10',
                !done && !isCurrent && 'bg-background text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span
              className={cn(
                isCurrent
                  ? 'font-medium text-foreground'
                  : done
                    ? 'text-foreground'
                    : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
