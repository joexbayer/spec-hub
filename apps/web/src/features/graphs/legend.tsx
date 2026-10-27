import type { ReactNode } from 'react'

export type LegendItem = { label: string; swatch: ReactNode }

// Swatches for the edge and node styles in edges.ts and nodes.tsx.
export const EDGE_SWATCH = {
  dependency: <span className="h-px w-5 bg-muted-foreground" />,
  blocking: <span className="w-5 border-t-2 border-dashed border-state-blocked" />,
  critical: <span className="h-[3px] w-5 rounded-full bg-muted-foreground" />,
}

export const NODE_SWATCH = {
  feature: <span className="size-3 rounded-[3px] border bg-card" />,
  blocked: <span className="size-3 rounded-[3px] border border-state-blocked/60 bg-card" />,
  landed: <span className="size-3 rounded-[3px] border bg-muted" />,
  unknown: <span className="size-3 rounded-[3px] border border-dashed border-state-unknown" />,
  focus: <span className="size-3 rounded-[3px] border bg-card ring-2 ring-foreground/50" />,
}

export function GraphLegend({ items, hint }: { items: LegendItem[]; hint?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t px-3 py-2 text-xs text-muted-foreground">
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {items.map((i) => (
          <li key={i.label} className="flex items-center gap-1.5">
            <span aria-hidden className="flex w-5 items-center justify-center">
              {i.swatch}
            </span>
            {i.label}
          </li>
        ))}
      </ul>
      {hint ? <span className="ml-auto hidden md:inline">{hint}</span> : null}
    </div>
  )
}
