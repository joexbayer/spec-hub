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
          <p className="text-sm text-muted-foreground">
            Nothing to copy when the repository is set up. Start Claude Code at the repository root, accept
            the folder trust prompt and approve the <code className="font-mono text-xs">spec-hub</code>{' '}
            server.
          </p>
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
        Then ask your agent "What is the team working on?" It should call the{' '}
        <code className="font-mono text-xs">board</code> tool, and this step ticks itself.
      </p>
    </div>
  )
}
