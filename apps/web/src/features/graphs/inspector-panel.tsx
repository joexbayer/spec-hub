import { ChevronRight, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Button } from '@/components/ui/button'

// Right-hand details for the selected node. Below `sm` it covers the canvas instead of squeezing it.
export function InspectorPanel({
  title,
  subtitle,
  icon,
  children,
  onClose,
}: {
  title: string
  subtitle?: ReactNode
  icon?: ReactNode
  children: ReactNode
  onClose: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <aside
      aria-label={`${title} details`}
      className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l bg-card sm:static sm:w-80 sm:shrink-0"
    >
      <div className="flex items-start gap-3 border-b p-3">
        {icon ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-panel text-muted-foreground [&_svg]:size-4">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h2>
          {subtitle ? <div className="truncate text-xs text-muted-foreground">{subtitle}</div> : null}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={collapsed ? 'Expand details' : 'Collapse details'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronRight className={collapsed ? '' : 'rotate-90'} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Close details" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>
      {collapsed ? null : <div className="flex-1 overflow-auto">{children}</div>}
    </aside>
  )
}
