// The reporter's commands as a developer types them in the repository root.
const SCRIPT = 'sh .specify/extensions/spec-hub/scripts/spec-hub'

export const CONNECT_COMMAND = `${SCRIPT} connect`
export const STATUS_COMMAND = `${SCRIPT} status`
export const MCP_COMMAND = `${SCRIPT} mcp`
export const HOOKS_COMMAND = `${SCRIPT} hooks "$(git config core.hooksPath)"`
export const mcpHeadersCommand = (mcpUrl: string) =>
  `CLAUDE_CODE_MCP_SERVER_URL=${mcpUrl} ${SCRIPT} mcp-headers`
