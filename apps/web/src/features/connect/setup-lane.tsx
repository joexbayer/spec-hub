import { ArrowRight } from 'lucide-react'
import { CopyBlock } from '@/components/copy-block'
import { Panel, PanelBody, PanelHeader } from '@/components/panel'
import { Button } from '@/components/ui/button'
import { HOOKS_COMMAND, MCP_COMMAND } from './commands'
import { Step } from './step'

const COMMIT_COMMAND =
  'git add .specify/extensions/spec-hub .mcp.json .claude/settings.json && git commit -m "Connect Spec Hub"'
const ALLOW_TOOLS = JSON.stringify({ permissions: { allow: ['mcp__spec-hub__*'] } }, null, 2)

export function SetupLane({
  installCommand,
  configSnippet,
  onConnectYourself,
}: {
  installCommand: string
  configSnippet: string
  onConnectYourself: () => void
}) {
  return (
    <Panel>
      <PanelHeader
        title="Set up the repository"
        description="Done once per repository by one person. Everyone else only follows Connect yourself."
      />
      <PanelBody>
        <ol className="divide-y">
          <Step n={1} title="Add the extension">
            <CopyBlock value={installCommand} />
            <p className="text-xs text-muted-foreground">
              Spec Kit asks once about an untrusted source; answer y.
            </p>
          </Step>
          <Step n={2} title="Link it to the project">
            <CopyBlock label=".specify/extensions/spec-hub/spec-hub-config.yml" value={configSnippet} />
          </Step>
          <Step
            n={3}
            title="Install the hooks in the repository's hooks directory"
            description="Only if the repository sets core.hooksPath (husky, .githooks)."
          >
            <CopyBlock value={HOOKS_COMMAND} />
          </Step>
          <Step
            n={4}
            title="Add the agent server"
            description="Writes .mcp.json; it holds no token, each person's agent reads their own."
          >
            <CopyBlock value={MCP_COMMAND} />
            <CopyBlock label="Allow its tools: .claude/settings.json" value={ALLOW_TOOLS} />
          </Step>
          <Step
            n={5}
            title="Commit"
            description="Add the hooks directory too if step 3 applied; merge it like any change."
            last
          >
            <CopyBlock value={COMMIT_COMMAND} />
          </Step>
        </ol>
        <div className="border-t px-5 py-3">
          <Button variant="outline" size="sm" onClick={onConnectYourself}>
            Now connect yourself <ArrowRight aria-hidden />
          </Button>
        </div>
      </PanelBody>
    </Panel>
  )
}
