import { PHASE_NAME, PHASE_ORDER, type PhaseKind } from '@spec-hub/core'
import { ListFilter } from 'lucide-react'
import { PHASE_DOT } from '@/components/phase-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function PhaseFilter({
  selected,
  onChange,
}: {
  selected: PhaseKind[]
  onChange: (next: PhaseKind[]) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 bg-card">
          <ListFilter />
          Phase
          {selected.length > 0 ? (
            <span className="rounded bg-muted px-1 text-xs tabular-nums">{selected.length}</span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Show phases
        </DropdownMenuLabel>
        {PHASE_ORDER.map((p) => (
          <DropdownMenuCheckboxItem
            key={p}
            checked={selected.includes(p)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(on) => onChange(on ? [...selected, p] : selected.filter((x) => x !== p))}
          >
            <span aria-hidden className={`size-2 rounded-full ${PHASE_DOT[p]}`} />
            {PHASE_NAME[p]}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange([])}>Clear</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
