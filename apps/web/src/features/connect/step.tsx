import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// One numbered step. With `done` set the badge ticks itself; without it the step is plain.
export function Step({
  n,
  title,
  description,
  done,
  last,
  children,
}: {
  n: number
  title: ReactNode
  description?: ReactNode
  done?: boolean
  last?: boolean
  children?: ReactNode
}) {
  return (
    <li className="relative flex gap-4 px-5 py-4">
      {last ? null : <span aria-hidden className="absolute top-11 bottom-0 left-[2.05rem] w-px bg-border" />}
      <span
        className={cn(
          'relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
          done ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
        )}
        {...(done === undefined
          ? { 'aria-hidden': true }
          : { role: 'img', 'aria-label': done ? `Step ${n} done` : `Step ${n} to do` })}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className={cn('font-medium', done && 'text-muted-foreground')}>{title}</div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </li>
  )
}
