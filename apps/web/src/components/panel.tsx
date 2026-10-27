import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

// The "card in card" frame: a muted outer panel with a header row, around a bordered inner card.
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return (
    <section
      data-slot="panel"
      className={cn('flex min-w-0 flex-col rounded-2xl border bg-panel p-1', className)}
      {...props}
    />
  )
}

export function PanelHeader({
  title,
  description,
  icon,
  count,
  action,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  count?: number
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5', className)}>
      {icon ? <span className="text-muted-foreground [&_svg]:size-4">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <h2 className="flex items-center gap-2 text-[15px] font-medium tracking-tight">
          {title}
          {count !== undefined ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full border bg-card px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          ) : null}
        </h2>
        {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

export function PanelBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="panel-body"
      className={cn('min-w-0 flex-1 rounded-xl border bg-card text-card-foreground shadow-xs', className)}
      {...props}
    />
  )
}
