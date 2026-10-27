import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Stats in the nested frame: one inner card split into cells by hairlines (the grid's gap shows the
// border colour), with an optional footer card below it.
export function StatStrip({
  children,
  footer,
  className,
}: {
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <div className="rounded-2xl border bg-panel p-1">
      <div className="overflow-hidden rounded-xl border bg-border shadow-xs">
        <div className={cn('grid grid-cols-2 gap-px md:grid-cols-4', className)}>{children}</div>
      </div>
      {footer ? <div className="px-4 pt-2.5 pb-2 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  )
}

export function StatTile({
  label,
  value,
  caption,
  icon,
}: {
  label: string
  value: ReactNode
  caption?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div data-slot="stat-tile" className="flex min-w-0 flex-col bg-card px-5 py-4">
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="truncate">{label}</span>
        {icon ? <span className="shrink-0 [&_svg]:size-4">{icon}</span> : null}
      </div>
      <div className="mt-2.5 text-[26px] leading-none font-medium tracking-tight tabular-nums">{value}</div>
      {caption ? <div className="mt-2.5 truncate text-xs text-muted-foreground">{caption}</div> : null}
    </div>
  )
}
