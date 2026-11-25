import { ChevronRight } from 'lucide-react'
import { CopyBlock } from '@/components/copy-block'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { CONNECT_COMMAND, HOOKS_COMMAND, mcpHeadersCommand, STATUS_COMMAND } from './commands'

type Entry = { symptom: string; cause: string; fix: string; commands: string[] }

// Claude Code behaviour as documented on 2026-11-25 (specs/007-connect-lanes/preview.md §2).
const entries = (mcpUrl: string): Entry[] => [
  {
    symptom: 'connect: "no hub configured", or the script is not found',
    cause: "The repository setup isn't on this branch.",
    fix: 'Pull the default branch once the setup is merged, or follow Set up the repository.',
    commands: ['git pull'],
  },
  {
    symptom: 'connect: "token rejected"',
    cause: 'The token was revoked or mistyped; connect already removed it.',
    fix: 'Create a token, run connect again, then reconnect your agent (in Claude Code: /mcp → spec-hub → Reconnect).',
    commands: [CONNECT_COMMAND],
  },
  {
    symptom: 'Nothing on the board after connect',
    cause: 'Only features whose documents have text the default branch never had count.',
    fix: 'status shows the last report and the last error.',
    commands: [STATUS_COMMAND],
  },
  {
    symptom: 'connect: "Hooks are team-managed … missing"',
    cause: "The repository's hooks directory lacks the spec-hub line.",
    fix: 'Once, for the team: install the hooks there and commit the directory.',
    commands: [HOOKS_COMMAND],
  },
  {
    symptom: 'Claude Code has no spec-hub server',
    cause:
      ".mcp.json isn't on this branch, the server prompt was declined, or Claude Code was started in a subdirectory.",
    fix: 'Pull the branch that has .mcp.json. To be asked again, reset your choices and restart Claude Code. Start it at the repository root.',
    commands: ['git pull', 'claude mcp reset-project-choices'],
  },
  {
    symptom: '/mcp shows spec-hub "Failed to connect"',
    cause:
      'The helper had no token (Claude Code started before connect, or the folder is not trusted yet), or the token was revoked: a 401 shows as failed, not as a sign-in.',
    fix: 'Run connect, accept the folder trust prompt, then /mcp → spec-hub → Reconnect. To see why, run the helper by hand and read its message:',
    commands: [mcpHeadersCommand(mcpUrl)],
  },
  {
    symptom: "Your edits to spec-hub don't take effect, or it uses an old token",
    cause: 'A personal entry with the same name wins over .mcp.json.',
    fix: 'claude mcp list warns about it. Remove the personal entries:',
    commands: [
      'claude mcp list',
      'claude mcp remove spec-hub --scope local',
      'claude mcp remove spec-hub --scope user',
    ],
  },
]

export function Troubleshooting({ mcpUrl }: { mcpUrl: string }) {
  return (
    <Panel>
      <PanelHeader title="Troubleshooting" />
      <PanelBody>
        <div className="space-y-1.5 px-4 py-3">
          <p className="text-sm">First, run</p>
          <CopyBlock value={STATUS_COMMAND} />
          <p className="text-xs text-muted-foreground">
            It checks this clone and your agent setup and says what is wrong.
          </p>
        </div>
        <ul className="divide-y border-t">
          {entries(mcpUrl).map((e) => (
            <li key={e.symptom}>
              <Collapsible>
                <CollapsibleTrigger className="group flex w-full items-start gap-2 px-4 py-2.5 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-90"
                  />
                  {e.symptom}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 px-4 pb-3 pl-10 text-sm">
                  <p className="text-muted-foreground">{e.cause}</p>
                  <p>{e.fix}</p>
                  {e.commands.map((c) => (
                    <CopyBlock key={c} value={c} />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  )
}
