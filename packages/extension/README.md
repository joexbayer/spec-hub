# Spec Hub

Spec Hub is a Spec Kit extension that silently reports your committed in-flight feature work to your team's Spec Hub. It needs only git (2.31 or later) and curl, and prints nothing in normal use.

## Set up the repository

Once per repository, by one person.

Install the extension:

```sh
specify extension add spec-hub --from https://<hub>/extension/spec-hub.zip
```

Spec Kit asks one "Untrusted Source" `[y/N]` question for an extension from a URL; answer `y`.

Link it to the project by setting `hub_url` and `project` in `.specify/extensions/spec-hub/spec-hub-config.yml`.

If the repository sets `core.hooksPath` (husky, `.githooks`), install the hooks there once:

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub hooks "$(git config core.hooksPath)"
```

With husky 9 this writes to `.husky/`, not the generated `.husky/_`.

Add the agent server (see [Agents](#agents)):

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub mcp
```

Commit the extension, the config, the hooks (if any), `.mcp.json` and `.claude/settings.json`.

## Connect yourself

Each developer, each clone. Create a token on the hub's Connect page, then:

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub connect
```

Clone-managed hooks run a copy of the reporter kept in `.git/spec-hub/`, never the checked-out one. Run `connect` again after upgrading the extension or moving the repository. Worktrees need nothing. Another clone runs `connect` and is not asked for the token again.

Check it with `sh .specify/extensions/spec-hub/scripts/spec-hub status`. It also says whether your agent setup is ready.

If you keep `backup/*` branches (for example before a rebase), each one shows up as another branch carrying its feature. Stop reporting them with:

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub private add backup/
```

Reports also include the default branch's specs when it has moved since the hub last saw it, so the hub can show finished features. One connected member with this version of the extension is enough to fill that list for the whole project.

A branch counts as working on a feature only if its spec, plan, tasks (or extra documents) contain text the default branch never had, so deploy branches and squash-merged leftovers don't show.

## Teammates' pushed branches

The hub project setting "Share pushed branches" is off by default. With it on, connected clones also report teammates' branches pushed in the last 14 days. They show under their author, marked "seen on the shared remote". One connected member is enough. The reporter never fetches, so the list is as fresh as your last `git fetch` or `git pull`.

## Extra documents

To show more than spec, plan and tasks, list file names in `.specify/extensions/spec-hub/spec-hub-config.yml`, separated by spaces (up to 5, each a `*.md` file other than spec, plan or tasks):

```yaml
documents: preview.md
```

Each listed file found in a feature folder is reported and shown as a tab on the feature page next to spec, plan and tasks. Agents can ask for it by name. Commit the config so the whole team shares it. Without the key nothing changes.

## Agents

Agents read the same board over MCP. The agent connects to `https://<hub>/mcp/<project>` with the same
personal token used for `connect`.

Claude Code, once per repository:

```sh
sh .specify/extensions/spec-hub/scripts/spec-hub mcp
```

It writes the `spec-hub` server into `.mcp.json` (or prints the entry to paste when the file
already exists). Commit it: every checkout, worktree and teammate gets the server. The file holds
no token; its `headersHelper` runs `spec-hub mcp-headers`, which reads the token you gave `connect`.
With the repository set up, a developer has nothing to configure: run `connect`, start Claude Code
at the repository root and approve the spec-hub server. Do not add the server with `claude mcp add`;
a personal entry overrides `.mcp.json`.

For teams without the extension, commit this `.mcp.json` instead (each person sets `SPEC_HUB_TOKEN` in their
shell profile):

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

## Troubleshooting

Run `sh .specify/extensions/spec-hub/scripts/spec-hub status` first. Its `Agent:` line says what is missing.

**Claude Code shows spec-hub "Failed to connect".** It had no token when it connected: Claude Code was started before `connect`, or the folder's trust prompt was not accepted yet. Or the token was revoked. Run `connect`, then `/mcp`, choose spec-hub, and Reconnect. To see the helper's message, run it by hand:

```sh
CLAUDE_CODE_MCP_SERVER_URL=https://<hub>/mcp/<project> sh .specify/extensions/spec-hub/scripts/spec-hub mcp-headers
```

**No spec-hub server at all.** Either `.mcp.json` is not on your branch (pull it), or the project-server prompt was declined (run `claude mcp reset-project-choices` and restart), or Claude Code was started in a subdirectory (start it at the repository root).

**A personal entry of the same name wins over `.mcp.json`.** `claude mcp list` warns about it. Remove it with `claude mcp remove spec-hub --scope local`, and again with `--scope user`.
