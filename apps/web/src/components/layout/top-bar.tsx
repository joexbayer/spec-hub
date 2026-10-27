import type { Board } from '@spec-hub/core'
import { skipToken, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import { Monitor, Moon, Search, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Fragment, useEffect, useState } from 'react'
import { PhaseBadge } from '@/components/phase-badge'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { meQuery } from '@/lib/query'

// `board` makes the crumb a link to that project's board.
type Crumb = { label: string; board?: string }

const VIEW_LABELS: Record<string, string> = { pipeline: 'Pipeline', work: 'Work map' }
const PROJECT_PAGES: Record<string, string> = { map: 'Dependency map', connect: 'Connect', admin: 'Admin' }

function useCrumbs(): Crumb[] {
  const queryClient = useQueryClient()
  const location = useRouterState({ select: (s) => s.location })
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent)
  // Subscribes to the cached board (the pages fetch it) so the feature crumb updates once it loads.
  const board = useQuery<Board>({ queryKey: ['board', parts[1]], queryFn: skipToken }).data
  if (parts[0] === 'p' && parts[1]) {
    const slug = parts[1]
    const name =
      queryClient.getQueryData(meQuery.queryKey)?.projects.find((p) => p.slug === slug)?.name ?? slug
    const project: Crumb = { label: name, board: slug }
    const page = parts[2]
    if (!page) {
      const view = VIEW_LABELS[(location.search as { view?: string }).view ?? '']
      return view
        ? [project, { label: 'Board', board: slug }, { label: view }]
        : [project, { label: 'Board' }]
    }
    if (page === 'f' && parts[3]) {
      const dir = parts[3]
      const entry = [...(board?.inFlight ?? []), ...(board?.stale ?? [])].find((e) => e.dir === dir)
      return [project, { label: 'Board', board: slug }, { label: entry?.number ?? dir }]
    }
    return [project, { label: PROJECT_PAGES[page] ?? page }]
  }
  if (parts[0] === 'tokens') return [{ label: 'Account' }, { label: 'Tokens' }]
  if (parts[0] === 'admin') return [{ label: 'Hub' }, { label: 'Projects' }]
  return [{ label: 'Projects' }]
}

function Crumbs() {
  const crumbs = useCrumbs()
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1
          return (
            <Fragment key={c.label}>
              {i > 0 ? <BreadcrumbSeparator className="hidden md:block" /> : null}
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden md:inline-flex'}>
                {last ? (
                  <BreadcrumbPage className="truncate font-medium">{c.label}</BreadcrumbPage>
                ) : c.board ? (
                  <BreadcrumbLink asChild>
                    <Link to="/p/$slug" params={{ slug: c.board }}>
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span>{c.label}</span>
                )}
              </BreadcrumbItem>
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function FeatureSearch({ slug }: { slug: string | undefined }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const board = slug ? queryClient.getQueryData<Board>(['board', slug]) : undefined
  const features = board ? [...board.inFlight, ...board.stale] : []

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        aria-label="Search features"
        className="h-9 w-9 justify-start gap-2 px-2.5 font-normal text-muted-foreground shadow-xs sm:w-64"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search features…</span>
        <kbd className="ml-auto hidden h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-flex">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search features"
        description="Search by number or title"
      >
        <CommandInput placeholder="Search by number or title" />
        <CommandList>
          {!board || !slug ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              Open the board to search features
            </div>
          ) : (
            <>
              <CommandEmpty>No matching features.</CommandEmpty>
              <CommandGroup heading="Features">
                {features.map((f) => (
                  <CommandItem
                    key={f.dir}
                    value={`${f.number ?? ''} ${f.title} ${f.dir}`}
                    onSelect={() => {
                      setOpen(false)
                      navigate({ to: '/p/$slug/f/$dir', params: { slug, dir: f.dir } })
                    }}
                  >
                    <span className="w-9 shrink-0 font-mono text-xs text-muted-foreground">
                      {f.number ?? '—'}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{f.title}</span>
                    <PhaseBadge phase={f.phase} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}

function ThemeToggle() {
  // next-themes sets the `dark` class on <html> and persists the choice in localStorage (guarded).
  const { setTheme } = useTheme()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="Toggle theme" className="size-9 shadow-xs">
          <Sun className="size-4 dark:hidden" />
          <Moon className="hidden size-4 dark:block" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setTheme('light')}>
          <Sun /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('dark')}>
          <Moon /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme('system')}>
          <Monitor /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TopBar() {
  const { slug } = useParams({ strict: false }) as { slug?: string }
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <Crumbs />
      <div className="ml-auto flex items-center gap-1.5">
        <FeatureSearch slug={slug} />
        <ThemeToggle />
      </div>
    </header>
  )
}
