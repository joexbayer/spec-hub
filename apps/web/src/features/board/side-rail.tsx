import { type Board, buildDependencyGraph, titleFromDir } from '@spec-hub/core'
import { Link } from '@tanstack/react-router'
import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, Clock, GitMerge, Lock, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '@/components/empty-state'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { OwnerAvatar } from '@/components/person-chip'
import { cn } from '@/lib/utils'
import type { LastReportAt } from './board-query'

function Row({
  icon,
  tone,
  title,
  children,
  aside,
}: {
  icon: ReactNode
  tone: string
  title: ReactNode
  children?: ReactNode
  aside?: ReactNode
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4', tone)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="truncate font-medium">{title}</div>
        {children ? <div className="text-xs text-muted-foreground">{children}</div> : null}
      </div>
      {aside}
    </li>
  )
}

export function SideRail({
  slug,
  board,
  lastReportAt,
  className,
}: {
  slug: string
  board: Board
  lastReportAt: LastReportAt
  className?: string
}) {
  const { blockedBy } = buildDependencyGraph(board)
  const collisions = board.inFlight.filter((e) => e.collisions.length > 0)
  const blocked = board.inFlight.filter((e) => blockedBy.has(e.dir))
  const attention = collisions.length + blocked.length + (board.stale.length > 0 ? 1 : 0)
  const feature = (dir: string, title: string) => (
    <Link to="/p/$slug/f/$dir" params={{ slug, dir }} className="hover:underline">
      {title}
    </Link>
  )
  return (
    <aside className={cn('space-y-4', className)}>
      <Panel>
        <PanelHeader title="Needs attention" count={attention} />
        <PanelBody>
          {attention === 0 ? (
            <EmptyState icon={CheckCircle2} title="All clear" className="py-6">
              No number collisions, blocked or stale features.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {collisions.map((e) => (
                <Row
                  key={`c-${e.dir}`}
                  icon={<AlertTriangle />}
                  tone="bg-state-collision/10 text-state-collision"
                  title={feature(e.dir, e.title)}
                >
                  Number collision: shares {e.number ?? 'its number'} with {e.collisions.join(', ')}
                </Row>
              ))}
              {blocked.map((e) => (
                <Row
                  key={`b-${e.dir}`}
                  icon={<Lock />}
                  tone="bg-state-blocked/10 text-state-blocked"
                  title={feature(e.dir, e.title)}
                >
                  Blocked by {blockedBy.get(e.dir)?.join(', ')}
                </Row>
              ))}
              {board.stale.length > 0 ? (
                <Row
                  icon={<Clock />}
                  tone="bg-muted text-muted-foreground"
                  title={`${board.stale.length} stale features`}
                >
                  No change for a while. They sit at the bottom of the list.
                </Row>
              ) : null}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Recently landed" count={board.recentlyLanded.length} />
        <PanelBody>
          {board.recentlyLanded.length === 0 ? (
            <EmptyState icon={GitMerge} title="Nothing landed yet" className="py-6">
              Features show up here once they reach the default branch.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {board.recentlyLanded.map((l) => (
                <Row
                  key={l.dir}
                  icon={<GitMerge />}
                  tone="bg-phase-landed/10 text-phase-landed"
                  title={titleFromDir(l.dir)}
                  aside={
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(l.firstSeenAt, { addSuffix: true })}
                    </span>
                  }
                >
                  <span className="font-mono">{l.dir.match(/^\d+/)?.[0] ?? l.dir}</span> landed
                </Row>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Team" count={board.members.length} />
        <PanelBody>
          {board.members.length === 0 ? (
            <EmptyState icon={Users} title="No members yet" className="py-6">
              A project admin adds people from the Admin page.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {board.members.map((m) => {
                const count = board.inFlight.filter(
                  (e) => e.owner.kind === 'member' && e.owner.userId === m.userId,
                ).length
                const at = lastReportAt[m.userId]
                const share = board.inFlight.length ? (count / board.inFlight.length) * 100 : 0
                return (
                  <li key={m.userId} className="flex items-center gap-3 px-4 py-3">
                    <OwnerAvatar owner={{ kind: 'member', ...m }} size="default" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate font-medium">@{m.githubLogin}</span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {count} in flight
                        </span>
                      </div>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-foreground/70"
                          style={{ width: `${share}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {at === undefined
                          ? 'Not connected yet'
                          : `Reported ${formatDistanceToNow(at, { addSuffix: true })}`}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </PanelBody>
      </Panel>
    </aside>
  )
}
