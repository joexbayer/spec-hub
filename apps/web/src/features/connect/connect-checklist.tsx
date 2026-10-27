import { Check, ChevronRight, Timer } from 'lucide-react'
import type { ReactNode } from 'react'
import { CopyBlock } from '@/components/copy-block'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CreateTokenDialog } from '@/features/tokens/create-token-dialog'
import { cn } from '@/lib/utils'
import { AgentSetup } from './agent-setup'
import type { Clone } from './connect-query'

export const CONNECT_COMMAND = 'sh .specify/extensions/spec-hub/scripts/spec-hub connect'

function Step({
  n,
  title,
  description,
  done,
  last,
  children,
}: {
  n: number
  title: string
  description?: string
  done: boolean
  last?: boolean
  children?: ReactNode
}) {
  return (
    <li className="relative flex gap-4 px-5 py-4">
      {last ? null : <span aria-hidden className="absolute top-11 bottom-0 left-[2.05rem] w-px bg-border" />}
      <span
        className={cn(
          'relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums',
          done ? 'border-transparent bg-primary text-primary-foreground' : 'bg-card text-muted-foreground',
        )}
        role="img"
        aria-label={done ? `Step ${n} done` : `Step ${n} to do`}
      >
        {done ? <Check className="size-3.5" /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className={cn('font-medium', done && 'text-muted-foreground')}>{title}</div>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {children}
      </div>
    </li>
  )
}

export function ConnectChecklist({
  mcpUrl,
  clones,
  tokenKey,
  agentDone,
  elapsed,
  install,
  onCreated,
  onAgentDone,
}: {
  mcpUrl: string
  clones: Clone[]
  tokenKey: string | null
  agentDone: boolean
  elapsed?: string
  install: { configSnippet: string; installCommand: string }
  onCreated: (key: string) => void
  onAgentDone: () => void
}) {
  const clone = clones[0]
  const cloneDone = clones.length > 0
  const doneCount = 1 + (tokenKey !== null ? 1 : 0) + (cloneDone ? 1 : 0) + (agentDone ? 1 : 0)

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Setup checklist"
          description="Each step ticks itself as the hub sees it happen."
          action={
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{doneCount} of 4 done</span>
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-foreground/70 transition-all"
                  style={{ width: `${(doneCount / 4) * 100}%` }}
                />
              </span>
            </div>
          }
        />
        <PanelBody>
          <ol className="divide-y">
            <Step n={1} title="Signed in" description="You are signed in with GitHub." done />
            <Step
              n={2}
              title="Create a token"
              description="The clone and your agent use it to talk to the hub."
              done={tokenKey !== null}
            >
              {tokenKey === null ? (
                <CreateTokenDialog onCreated={onCreated} />
              ) : (
                <CopyBlock label="Your token" value={tokenKey} secret />
              )}
            </Step>
            <Step
              n={3}
              title="Connect this clone"
              description="Run this in the repository's root."
              done={cloneDone}
            >
              <Collapsible defaultOpen={!cloneDone} className="rounded-lg border bg-panel">
                <CollapsibleTrigger className="group flex w-full items-center gap-2 px-3 py-2 text-left text-sm">
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                  <span className="font-medium">First time in this repository?</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Skip if .specify/extensions/spec-hub is already there
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 border-t px-3 pt-3 pb-3">
                  <CopyBlock label="1. Add the Spec Kit extension" value={install.installCommand} />
                  <p className="text-xs text-muted-foreground">
                    Spec Kit asks once about an untrusted source; answer y.
                  </p>
                  <CopyBlock
                    label="2. Link it to this project: .specify/extensions/spec-hub/spec-hub-config.yml"
                    value={install.configSnippet}
                  />
                  <CopyBlock
                    label="3. Only if the repository sets core.hooksPath (husky, .githooks): install the hooks there"
                    value={`sh .specify/extensions/spec-hub/scripts/spec-hub hooks "$(git config core.hooksPath)"`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Commit these files once; everyone else then only runs the command below.
                  </p>
                </CollapsibleContent>
              </Collapsible>
              <CopyBlock label="Connect your clone" value={CONNECT_COMMAND} />
              <p className="text-sm text-muted-foreground">
                {tokenKey === null
                  ? 'It asks for a token: create one in step 2 first.'
                  : 'Paste your token from step 2 when it asks.'}
              </p>
              {clone ? (
                <p className="inline-flex items-center gap-1.5 rounded-md border border-phase-implemented/40 bg-phase-implemented/10 px-2 py-1 text-sm">
                  <Check aria-hidden className="size-3.5 text-phase-implemented" />
                  {clone.features} {clone.features === 1 ? 'feature' : 'features'} reported
                </p>
              ) : null}
            </Step>
            <Step
              n={4}
              title="Connect your agent"
              description="Give your agent the hub's MCP tools."
              done={agentDone}
              last
            >
              <AgentSetup mcpUrl={mcpUrl} tokenKey={tokenKey} />
              {agentDone ? null : (
                <Button variant="outline" size="sm" onClick={onAgentDone}>
                  <Check /> Done
                </Button>
              )}
            </Step>
          </ol>
          {elapsed ? (
            <div className="flex items-center gap-2 border-t px-5 py-3 text-sm text-muted-foreground">
              <Timer aria-hidden className="size-4" />
              Elapsed <span className="font-mono text-foreground tabular-nums">{elapsed}</span>
            </div>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  )
}
