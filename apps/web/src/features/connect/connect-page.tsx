import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { AlertTriangle, Bot, KeyRound, LayoutDashboard } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Skeleton } from '@/components/ui/skeleton'
import { meQuery } from '@/lib/query'
import { ConnectChecklist } from './connect-checklist'
import { connectQuery } from './connect-query'

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function ConnectPage({ slug }: { slug: string }) {
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(startedAt)
  const [tokenKey, setTokenKey] = useState<string | null>(null)
  const [agentDone, setAgentDone] = useState(false)
  const [cloneDone, setCloneDone] = useState(false)

  const info = useQuery(connectQuery(slug, !cloneDone))
  const name = useQuery(meQuery).data?.projects.find((p) => p.slug === slug)?.name ?? slug
  const hasClone = (info.data?.clones.length ?? 0) > 0
  if (hasClone && !cloneDone) setCloneDone(true)

  const allDone = tokenKey !== null && hasClone && agentDone
  const [stoppedAt, setStoppedAt] = useState<number | null>(null)
  if (allDone && stoppedAt === null) setStoppedAt(Date.now())

  useEffect(() => {
    if (stoppedAt !== null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [stoppedAt])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 p-4 md:p-6">
      <PageHeader
        title={`Connect ${name}`}
        description="Four steps, a few minutes: link this clone and your agent to the hub."
      />
      {info.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : info.error ? (
        <Panel role="alert">
          <PanelBody>
            <EmptyState icon={AlertTriangle} title="Could not load">
              {info.error.message}
            </EmptyState>
          </PanelBody>
        </Panel>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <ConnectChecklist
            mcpUrl={info.data.mcpUrl}
            clones={info.data.clones}
            tokenKey={tokenKey}
            agentDone={agentDone}
            elapsed={mmss((stoppedAt ?? now) - startedAt)}
            install={info.data}
            onCreated={setTokenKey}
            onAgentDone={() => setAgentDone(true)}
          />
          <Panel>
            <PanelHeader title="What you get" />
            <PanelBody>
              <ul className="divide-y text-sm">
                <Benefit icon={<LayoutDashboard />} title="Your work on the board">
                  Each report from this clone updates the team's board.
                </Benefit>
                <Benefit icon={<Bot />} title="An agent that knows the team">
                  Claude Code can ask the hub what others are working on.
                </Benefit>
                <Benefit icon={<KeyRound />} title="Tokens you control">
                  Revoke a token any time on the{' '}
                  <Link to="/tokens" className="underline underline-offset-2">
                    Tokens
                  </Link>{' '}
                  page.
                </Benefit>
              </ul>
            </PanelBody>
          </Panel>
        </div>
      )}
    </div>
  )
}

function Benefit({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border bg-panel text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </li>
  )
}
