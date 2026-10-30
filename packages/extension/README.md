# Spec Hub

Spec Hub is a Spec Kit extension that silently reports your committed in-flight feature work to your team's Spec Hub. It needs only git and curl, and prints nothing in normal use.

## Install

```sh
specify extension add spec-hub --from https://<hub>/extension/spec-hub.zip
```

Spec Kit asks one "Untrusted Source" `[y/N]` question for an extension from a URL; answer `y`.

## Connect a clone

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub connect
```

Clone-managed hooks run a copy of the reporter kept in `.git/spec-hub/`, never the checked-out one. Run `connect` again after upgrading the extension or moving the repository.

If you keep `backup/*` branches (for example before a rebase), each one shows up as another branch carrying its feature. Stop reporting them with:

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub private add backup/
```

## Agents

Agents read the same board over MCP. The agent connects to `https://<hub>/mcp/<project>` with the same
personal token used for `connect`.

Claude Code:

```sh
claude mcp add --transport http spec-hub https://<hub>/mcp/<project> --header "Authorization: Bearer <token>"
```

To share it with the team, commit `.mcp.json` (no token; each person sets `SPEC_HUB_TOKEN` in their shell profile):

```json
{
  "mcpServers": {
    "spec-hub": {
      "type": "http",
      "url": "https://<hub>/mcp/<project>",
      "headers": { "Authorization": "Bearer ${SPEC_HUB_TOKEN}" }
    }
  }
}
```

VS Code, `.vscode/mcp.json` (prompts for the token once):

```json
{
  "servers": {
    "spec-hub": {
      "type": "http",
      "url": "https://<hub>/mcp/<project>",
      "headers": { "Authorization": "Bearer ${input:spec-hub-token}" }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "spec-hub-token", "description": "Spec Hub token", "password": true }
  ]
}
```

Cursor, `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "spec-hub": {
      "url": "https://<hub>/mcp/<project>",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Any other MCP client: URL `https://<hub>/mcp/<project>`, transport Streamable HTTP, header `Authorization: Bearer <token>`.

The hub's Connect page fills in the URL and the token.

Check it works: ask your agent "What is the team working on?" It should call the `board` tool.

The server exposes `board` and `feature`, which are read-only, and the landing lock: `land_lock`,
`land_unlock` and `landing` (see the main README). The lock tools change only the hub's landing
queue, never the repository.

Commit this rule in `.claude/settings.json` so the tools never prompt:

```json
{"permissions":{"allow":["mcp__spec-hub__*"]}}
```

