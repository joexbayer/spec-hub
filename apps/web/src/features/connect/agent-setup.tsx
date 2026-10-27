import { useState } from 'react'
import { CopyBlock } from '@/components/copy-block'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const TAB_KEY = 'spec-hub.agent-client'
const CLIENTS = ['claude-code', 'vscode', 'cursor', 'other'] as const
type Client = (typeof CLIENTS)[number]

const json = (value: unknown) => JSON.stringify(value, null, 2)

function readTab(): Client {
  try {
    const saved = localStorage.getItem(TAB_KEY)
    return CLIENTS.find((c) => c === saved) ?? 'claude-code'
  } catch {
    return 'claude-code'
  }
}

function saveTab(tab: string) {
  try {
    localStorage.setItem(TAB_KEY, tab)
  } catch {
    // storage blocked: the tab just isn't remembered
  }
}

export function AgentSetup({ mcpUrl, tokenKey }: { mcpUrl: string; tokenKey: string | null }) {
  const [tab, setTab] = useState<Client>(readTab)
  const token = tokenKey ?? '<your token>'
  const header = `Authorization: Bearer ${token}`

  const claudeCommand = `claude mcp add --transport http spec-hub ${mcpUrl} --header "Authorization: Bearer ${token}"`
  const claudeProjectFile = json({
    mcpServers: {
      'spec-hub': {
        type: 'http',
        url: mcpUrl,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal client-side variable syntax, not a JS template
        headers: { Authorization: 'Bearer ${SPEC_HUB_TOKEN}' },
      },
    },
  })
  const claudeAllow = json({ permissions: { allow: ['mcp__spec-hub__*'] } })
  const vscodeFile = json({
    servers: {
      'spec-hub': {
        type: 'http',
        url: mcpUrl,
        // biome-ignore lint/suspicious/noTemplateCurlyInString: literal client-side variable syntax, not a JS template
        headers: { Authorization: 'Bearer ${input:spec-hub-token}' },
      },
    },
    inputs: [{ type: 'promptString', id: 'spec-hub-token', description: 'Spec Hub token', password: true }],
  })
  const cursorFile = json({
    mcpServers: { 'spec-hub': { url: mcpUrl, headers: { Authorization: `Bearer ${token}` } } },
  })

  return (
    <div className="space-y-3">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Client)
          saveTab(v)
        }}
      >
        <TabsList>
          <TabsTrigger value="claude-code">Claude Code</TabsTrigger>
          <TabsTrigger value="vscode">VS Code</TabsTrigger>
          <TabsTrigger value="cursor">Cursor</TabsTrigger>
          <TabsTrigger value="other">Other</TabsTrigger>
        </TabsList>
        <TabsContent value="claude-code" className="space-y-3">
          <CopyBlock label="Add the server (just you)" value={claudeCommand} />
          <p className="text-sm text-muted-foreground">
            Tip: a leading space keeps the command out of your shell history in bash with ignorespace or zsh
            with HIST_IGNORE_SPACE.
          </p>
          <CopyBlock
            label="Or share it with the team: .mcp.json in the project root"
            value={claudeProjectFile}
          />
          <p className="text-sm text-muted-foreground">
            The file holds no token. Each person sets SPEC_HUB_TOKEN in their shell profile.
          </p>
          <CopyBlock label="Skip the permission prompts: .claude/settings.json" value={claudeAllow} />
        </TabsContent>
        <TabsContent value="vscode" className="space-y-3">
          <CopyBlock label=".vscode/mcp.json" value={vscodeFile} />
          <p className="text-sm text-muted-foreground">
            VS Code asks for the token once and keeps it out of the file.
          </p>
        </TabsContent>
        <TabsContent value="cursor" className="space-y-3">
          <CopyBlock label="~/.cursor/mcp.json" value={cursorFile} />
        </TabsContent>
        <TabsContent value="other" className="space-y-3">
          <CopyBlock label="URL" value={mcpUrl} />
          <CopyBlock label="Transport" value="Streamable HTTP" />
          <CopyBlock label="Header" value={header} />
        </TabsContent>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        Check it works: ask your agent "What is the team working on?" It should call the{' '}
        <code className="font-mono text-xs">board</code> tool.
      </p>
    </div>
  )
}
