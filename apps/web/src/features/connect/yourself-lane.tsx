import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { CopyBlock } from '@/components/copy-block'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { CreateTokenDialog } from '@/features/tokens/create-token-dialog'
import { shortAgo } from '@/lib/time'
import { AgentSetup } from './agent-setup'
import { CONNECT_COMMAND } from './commands'
import type { Clone } from './connect-query'
import { Step } from './step'

export function YourselfLane({
  mcpUrl,
  clones,
  agentSeenAt,
  tokenKey,
  onCreated,
}: {
  mcpUrl: string
  clones: Clone[]
  agentSeenAt: string | null
  tokenKey: string | null
  onCreated: (key: string) => void
}) {
  const clone = clones[0]
  const cloneDone = clones.length > 0
  const agentDone = agentSeenAt !== null
  // A connected clone or agent proves a token exists, even if it was made before this visit.
  const tokenDone = tokenKey !== null || cloneDone || agentDone
  const doneCount = [tokenDone, cloneDone, agentDone].filter(Boolean).length
  const ago = agentSeenAt ? shortAgo(Date.parse(agentSeenAt)) : null

  return (
    <Panel>
      <PanelHeader
        title="Connect yourself"
        description="Each developer, each clone. Each step ticks itself as the hub sees it happen."
        action={
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">{doneCount} of 3 done</span>
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-foreground/70 transition-all"
                style={{ width: `${(doneCount / 3) * 100}%` }}
              />
            </span>
          </div>
        }
      />
      <PanelBody>
        <ol className="divide-y">
          <Step
            n={1}
            title="Create a token"
            description="Your clone and your agent use it to talk to the hub."
            done={tokenDone}
          >
            {tokenKey === null ? (
              <CreateTokenDialog onCreated={onCreated} />
            ) : (
              <CopyBlock label="Your token" value={tokenKey} secret />
            )}
            <p className="text-xs text-muted-foreground">
              Revoke a token any time on the{' '}
              <Link to="/tokens" className="underline underline-offset-2">
                Tokens
              </Link>{' '}
              page.
            </p>
          </Step>
          <Step
            n={2}
            title="Connect this clone"
            description="Run this in the repository's root."
            done={cloneDone}
          >
            <CopyBlock value={CONNECT_COMMAND} />
            <p className="text-sm text-muted-foreground">
              {tokenKey === null && !cloneDone
                ? 'It asks for a token: create one in step 1 first.'
                : 'Paste the token from step 1 when it asks.'}
            </p>
            {clone ? (
              <Seen>
                {clone.features} {clone.features === 1 ? 'feature' : 'features'} reported
              </Seen>
            ) : null}
          </Step>
          <Step
            n={3}
            title="Check your agent"
            description="Your agent gets the hub's tools for this project."
            done={agentDone}
            last
          >
            <AgentSetup mcpUrl={mcpUrl} tokenKey={tokenKey} />
            {ago ? <Seen>Your agent called the hub {ago === 'now' ? 'just now' : ago}</Seen> : null}
          </Step>
        </ol>
        <p className="border-t px-5 py-3 text-sm text-muted-foreground">
          Worktrees of this clone need nothing. Another clone: run connect there; it reuses your token.
        </p>
      </PanelBody>
    </Panel>
  )
}

function Seen({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-1.5 rounded-md border border-phase-implemented/40 bg-phase-implemented/10 px-2 py-1 text-sm">
      <Check aria-hidden className="size-3.5 text-phase-implemented" />
      {children}
    </p>
  )
}
