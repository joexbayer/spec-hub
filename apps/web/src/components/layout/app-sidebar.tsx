import type { Board } from '@spec-hub/core'
import { skipToken, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams, useRouterState } from '@tanstack/react-router'
import {
  Check,
  ChevronsUpDown,
  Columns3,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Network,
  Plug,
  Settings,
  Shield,
  Workflow,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { initials } from '@/components/person-chip'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { signOut } from '@/lib/auth-client'
import { meQuery } from '@/lib/query'

function ProjectMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid size-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground ${className ?? ''}`}
    >
      {initials(name)}
    </span>
  )
}

function NavItem({
  label,
  icon,
  active,
  badge,
  children,
}: {
  label: string
  icon: ReactNode
  active: boolean
  badge?: number
  children: (inner: ReactNode) => ReactNode
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={label}
        onClick={() => isMobile && setOpenMobile(false)}
      >
        {children(
          <>
            {icon}
            <span>{label}</span>
          </>,
        )}
      </SidebarMenuButton>
      {badge !== undefined ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { data: me } = useSuspenseQuery(meQuery)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { slug } = useParams({ strict: false }) as { slug?: string }
  const location = useRouterState({ select: (s) => s.location })
  const project = me.projects.find((p) => p.slug === slug)
  const isProjectAdmin = project?.role === 'admin'
  // Read the board only from the cache: the board pages own the fetch and its polling.
  const board = useQuery<Board>({ queryKey: ['board', slug], queryFn: skipToken }).data

  const path = location.pathname
  const view = (location.search as { view?: string }).view ?? 'list'
  const onBoard = !!project && path === `/p/${project.slug}`

  const onSignOut = async () => {
    await signOut()
    queryClient.clear()
    await navigate({ to: '/sign-in' })
  }

  const displayName = me.user.name ?? me.user.githubLogin

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip="Switch project"
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <ProjectMark name={project?.name ?? 'Spec Hub'} />
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{project?.name ?? 'Spec Hub'}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {project ? `${project.slug} · ${project.role}` : 'Select a project'}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={4} className="min-w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Projects
                </DropdownMenuLabel>
                {me.projects.length === 0 ? (
                  <DropdownMenuItem disabled>No projects yet</DropdownMenuItem>
                ) : (
                  me.projects.map((p) => (
                    <DropdownMenuItem
                      key={p.slug}
                      className="gap-2"
                      onSelect={() => navigate({ to: '/p/$slug', params: { slug: p.slug } })}
                    >
                      <ProjectMark name={p.name} className="size-6 rounded-md text-[10px]" />
                      <span className="truncate">{p.name}</span>
                      {p.slug === slug ? <Check className="ml-auto" /> : null}
                    </DropdownMenuItem>
                  ))
                )}
                {me.isHubAdmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => navigate({ to: '/admin/projects' })}>
                      <Shield />
                      Manage projects
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {project ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Board</SidebarGroupLabel>
              <SidebarMenu>
                <NavItem
                  label="Overview"
                  icon={<LayoutDashboard />}
                  active={onBoard && view === 'list'}
                  badge={board?.inFlight.length}
                >
                  {(inner) => (
                    <Link to="/p/$slug" params={{ slug: project.slug }} search={{}}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
                <NavItem label="Pipeline" icon={<Columns3 />} active={onBoard && view === 'pipeline'}>
                  {(inner) => (
                    <Link to="/p/$slug" params={{ slug: project.slug }} search={{ view: 'pipeline' }}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
                <NavItem label="Work map" icon={<Workflow />} active={onBoard && view === 'work'}>
                  {(inner) => (
                    <Link to="/p/$slug" params={{ slug: project.slug }} search={{ view: 'work' }}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
                <NavItem label="Dependency map" icon={<Network />} active={path.endsWith('/map')}>
                  {(inner) => (
                    <Link to="/p/$slug/map" params={{ slug: project.slug }}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
              </SidebarMenu>
            </SidebarGroup>
            <SidebarGroup>
              <SidebarGroupLabel>Project</SidebarGroupLabel>
              <SidebarMenu>
                <NavItem label="Connect" icon={<Plug />} active={path.endsWith('/connect')}>
                  {(inner) => (
                    <Link to="/p/$slug/connect" params={{ slug: project.slug }}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
                <NavItem label="Landing" icon={<Lock />} active={path.endsWith('/landing')}>
                  {(inner) => (
                    <Link to="/p/$slug/landing" params={{ slug: project.slug }}>
                      {inner}
                    </Link>
                  )}
                </NavItem>
                {isProjectAdmin ? (
                  <NavItem label="Admin" icon={<Settings />} active={path.endsWith('/admin')}>
                    {(inner) => (
                      <Link to="/p/$slug/admin" params={{ slug: project.slug }}>
                        {inner}
                      </Link>
                    )}
                  </NavItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroup>
          </>
        ) : null}
        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarMenu>
            <NavItem label="Tokens" icon={<KeyRound />} active={path === '/tokens'}>
              {(inner) => <Link to="/tokens">{inner}</Link>}
            </NavItem>
            {me.isHubAdmin ? (
              <NavItem label="Hub projects" icon={<Shield />} active={path === '/admin/projects'}>
                {(inner) => <Link to="/admin/projects">{inner}</Link>}
              </NavItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  tooltip={`@${me.user.githubLogin}`}
                  className="data-[state=open]:bg-sidebar-accent"
                >
                  <Avatar className="size-8 rounded-lg border">
                    {me.user.image ? <AvatarImage src={me.user.image} alt="" /> : null}
                    <AvatarFallback className="rounded-lg text-xs">
                      {initials(me.user.githubLogin)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-medium">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">@{me.user.githubLogin}</span>
                  </span>
                  <ChevronsUpDown className="ml-auto size-4 opacity-60" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" sideOffset={4} className="min-w-60">
                <DropdownMenuLabel className="flex items-center gap-2 font-normal">
                  <Avatar className="size-8 rounded-lg border">
                    {me.user.image ? <AvatarImage src={me.user.image} alt="" /> : null}
                    <AvatarFallback className="rounded-lg text-xs">
                      {initials(me.user.githubLogin)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 leading-tight">
                    <span className="truncate text-sm font-medium">{displayName}</span>
                    <span className="truncate text-xs text-muted-foreground">@{me.user.githubLogin}</span>
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem onSelect={() => navigate({ to: '/tokens' })}>
                    <KeyRound />
                    Tokens
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
