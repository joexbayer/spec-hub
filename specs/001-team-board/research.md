# Research: Team board

Phase 0 for [plan.md](plan.md). Everything marked *verified* was checked on 2026-10-26: by installing
the package and reading its type definitions, by running a live server, or by running git locally.
Each entry gives the decision, the rationale and the alternatives considered.

## R1. MCP endpoint: `createMcpHandler`, stateless, shared handler

- **Decision**: Use `createMcpHandler(factory)` from `@modelcontextprotocol/server` 2.4.0, mounted on
  a Hono route `app.all('/mcp/:slug')`. Keep the default `legacy: 'stateless'` so clients that only
  speak the 2025 protocol also work. The route verifies the bearer token and membership first, then
  calls `handler.fetch(c.req.raw, { authInfo })`. The factory runs once per request and builds an
  `McpServer` whose tools close over `authInfo.clientId` (the user id) and `authInfo.extra` (the
  project).
- **Rationale** (verified on a live Hono server):
  - It is the SDK's purpose-built entry for the 2026-07-28 stateless protocol.
  - `server/discover` is answered automatically, and clients don't have to call it first.
  - `authInfo` is passed straight through to the factory and to tool context (`ctx.http.authInfo`).
  - `registerTool(name, { description, inputSchema: z.object(...), annotations: { readOnlyHint:
    true } }, cb)` works with zod 4. Invalid arguments come back as `isError` results, not protocol
    errors.
- **Alternatives**:
  - `@modelcontextprotocol/hono`: it only provides Host/Origin validation helpers and an app
    factory, not MCP serving, so it isn't needed.
  - Per-request `WebStandardStreamableHTTPServerTransport`: the 2025 idiom, superseded by
    `createMcpHandler`.
  - `legacy: 'reject'`: would lock out clients that haven't moved to 2026-07-28 yet.
- **Gotcha**: `createMcpHandler` does no token verification. The Hono route must do it before
  calling `fetch`.

## R2. Auth: Better Auth 1.7.12 with the separate `@better-auth/api-key` package

- **Decision**:
  - `betterAuth` with the Drizzle adapter (`provider: 'pg'`), the GitHub social provider, and
    `user.additionalFields.githubLogin`, filled by `mapProfileToUser: p => ({ githubLogin:
    p.login.toLowerCase() })`.
  - `overrideUserInfoOnSignIn: true`, so a GitHub rename refreshes the login.
  - The `apiKey({ defaultPrefix: 'sh_', rateLimit: { enabled: false } })` plugin.
- **Rationale** (verified in types and runtime source):
  - Keys are SHA-256 hashed at rest by default, and the plaintext is returned only by create.
  - `createApiKey({ body: { userId, name, permissions } })` is server-only for `userId` and
    `permissions`.
  - `verifyApiKey({ body: { key, permissions } })` returns `{ valid, key: { referenceId, ... } }`.
    `referenceId` is the user id. A key without the required permissions fails.
  - `enableSessionForAPIKeys` defaults to false, so keys never become web sessions.
  - The plugin records `lastRequest`, which the token list shows as "last used".
  - `databaseHooks.user.create.before` can return `false` to block sign-up. `user.create.after`
    can bind pending invitations.
- **Gotchas found**:
  - **The plugin's rate limit is on by default at 10 requests per key per 24 h.** That would cut
    off a reporter immediately, so it is disabled. Bounded request sizes and per-request membership
    checks are the controls instead.
  - The plugin's own HTTP routes (`/api/auth/api-key/*`) would let a signed-in user create keys
    that skip our audit log. Such keys would have no permissions and so could do nothing, but the
    hub returns 404 for those paths and routes all token management through its own endpoints,
    which write the audit log.
  - `verifyApiKey` has no HTTP route, so Bearer parsing is ours.
  - Use the `auth` CLI (`pnpm dlx auth@latest generate`) to generate the Drizzle schema.
    `@better-auth/cli` lags behind at 1.4.
- **Alternatives**:
  - Lucia: deprecated as a library.
  - Our own session and token code: rejected under Art. 7.3, since Better Auth already covers
    GitHub OAuth, sessions, hashed keys and permissions.
  - Better Auth's MCP/OAuth plugin: still in the 1.8 beta, and planned for layer 4.

## R3. Reporter trigger: git hooks, installed two ways

- **Decision**: Hook four events: `post-commit`, `post-checkout`, `post-merge` (which covers pulls)
  and `post-rewrite` (rebase and amend). Each hook runs one line,
  `sh .specify/extensions/spec-hub/scripts/spec-hub hook <event> || true`, which starts a background
  report and returns at once. How the line gets there depends on the repository:
  - **Clone-managed hooks** (`core.hooksPath` unset, the git default): `spec-hub connect` writes the
    four hook files into `$(git rev-parse --git-common-dir)/hooks/`, which every linked worktree of
    the clone shares. An existing hook file of the same name that isn't ours is never overwritten.
    `connect` prints the one line to add to it instead.
  - **Team-managed hooks** (`core.hooksPath` set to a tracked directory, such as the pilot's
    `.githooks` or husky's `.husky`): the team commits the line into those hook files once, with
    `spec-hub hooks <dir>` writing or appending it. After that, `connect` only stores credentials
    and a clone id, and checks that the line is present.
- **Rationale** (verified locally):
  - Git 2.50.1 has no config-based hooks: a `hook.<name>.command` test hook never ran. So hooks
    must be files.
  - Taking over `core.hooksPath` with a chaining dispatcher was rejected. the pilot's
    `bin/worktree:123` runs `git config core.hooksPath .githooks` on every worktree it creates, and
    husky resets the setting on every `npm install`. Either would silently switch the reporter off.
  - Hooks run with the worktree root as their working directory (githooks(5)), so the relative
    script path works in every worktree.
  - **Coverage**: a report is a complete picture of *all* local branches, because refs are shared
    by all worktrees. A commit in a worktree whose checkout predates the hook files is therefore
    picked up by the next hooked event in any worktree. `spec-hub report` can also be run by hand.
- **Alternatives**:
  - cron or launchd polling: macOS privacy controls (TCC) block background access to
    protected folders where repositories often live, and it adds a daemon to every laptop.
  - Agent hooks (Claude Code) or Spec Kit hooks: agent-specific, or limited to Spec Kit commands
    (Art. 2.4).
  - A `core.hooksPath` takeover: fragile, as above.

## R4. Reporter language: POSIX `sh` with `git` and `curl` only

- **Decision**: The reporter is one POSIX shell script in the Spec Kit extension. It builds a JSON
  manifest with a small escaping helper (backslash, double quote, control characters stripped) and
  uploads each missing document as the raw output of `git cat-file blob`.
- **Rationale**: `git`, `curl` and `sh` are on every machine that runs Spec Kit, including Git for
  Windows. Node or Python on `PATH` is not guaranteed for teams outside JavaScript (Art. 2). The
  only free-text fields (branch, directory and author names) are escaped. Document content never
  goes through JSON.
- **Alternatives**:
  - A Node script: requires Node in non-JS repos.
  - A Go binary: needs a per-platform build and distribution.
  - Python: `specify` runs on uv's managed Python, which may not be on `PATH`.

## R5. What a report contains, and how "in flight" is computed

- **Decision**: For each local branch that isn't private and isn't already contained in the default
  branch (`git for-each-ref --no-merged=<remote>/<default>`), the reporter:
  1. computes `mb = merge-base(<remote>/<default>, branch)`;
  2. takes the feature directories the branch itself changed since `mb`
     (`git diff --name-only mb branch -- specs/`);
  3. keeps those whose tree at the branch tip differs from the default branch's.

  For each kept feature it sends the content IDs and sizes of `spec.md`, `plan.md` and `tasks.md`,
  the last change time (`git log -1 --format=%ct branch -- specs/<dir>`), and the author of the
  commit that added `spec.md`. It also sends the default branch's tip, tip time and the list of
  feature directories on it.
- **Rationale**: Comparing only the tip trees would put every feature that the default branch
  changed after a branch was cut onto that branch, as a false "in flight". pilot edits landed
  features' tasks on `main` regularly, so this would happen constantly. Restricting to directories
  the branch changed fixes that. **This tightens spec FR-012, which is updated to match.**
- **Alternatives**:
  - Tip-tree comparison only: false positives, as above.
  - Hub-side computation: needs repository access, which is out of scope for layer 1 (FR-033).

## R6. Content IDs are recomputed by the hub

- **Decision**: A document upload (`PUT .../blobs/:oid`) is accepted only if the hub's own git blob
  hash of the bytes equals `:oid`: SHA-1 of `"blob <len>\0" + bytes`, or SHA-256 for repositories
  whose IDs are 64 hex characters. Documents are stored per project, keyed by `(project, oid)`.
- **Rationale**:
  - Layer 2 binds approvals to these IDs (Art. 4.2), so a client must not be able to attach
    different text to an ID.
  - Scoping per project means knowing an ID never exposes another project's text (Art. 5.2).
  - It costs one hash.
- **Alternatives**: trusting client IDs (breaks Art. 4.2 later), or a global content store (risks
  leaking across projects).

## R7. Live updates: polling, not server-sent events

- **Decision**: The board refetches every 10 s while visible (TanStack Query `refetchInterval`,
  paused in background tabs).
- **Rationale**: FR-019 asks for 30 s. Polling meets it with no extra moving parts. At four to
  thirty viewers, the load is negligible.
- **Ceiling and upgrade trigger**: when layer 2 needs instant inbox updates, switch to server-sent
  events from Hono's `streamSSE`.
- **Alternatives**: server-sent events with Postgres LISTEN/NOTIFY, deferred until something needs
  them.

## R8. No job queue in layer 1

- **Decision**: No pg-boss yet. Ingestion is synchronous and small. Staleness and landed windows are
  computed when the board is read.
- **Rationale**: Nothing in layer 1 runs later or on a schedule. pg-boss arrives with layer 2's
  reminders and digest, as Art. 6 already lists.

## R9. Markdown: one parser for facts, a sanitized renderer for display

- **Decision**:
  - `packages/core` parses with `mdast-util-from-markdown` and `mdast-util-gfm` (2.1.0, 3.1.0) to
    get the title (first heading at depth 1, minus the template's "Feature Specification:"
    prefix), the owner header, clarification markers (text nodes only, never code), and tasks (task
    list items whose text starts with `T` and digits).
  - The web renders with `react-markdown` 10, `remark-gfm` and `rehype-sanitize`, with no raw HTML,
    images replaced by their alt text, and only relative, `http` and `https` links.
  - `mermaid` 12 is loaded only when a document has a diagram, with `securityLevel: 'strict'`.
- **Rationale**:
  - An AST makes "outside code" exact. The spec itself is the test case: it mentions the
    clarification marker in code.
  - Sanitizing as well as never enabling raw HTML gives two independent layers for FR-021.
- **Alternatives**: regular expressions over raw text (wrong for code blocks), or `marked` plus
  DOMPurify (a second markdown dialect to keep in step with the parser).

## R10. Agent connection: `claude mcp add`, not a committed `.mcp.json`

- **Decision**: The connect page shows the following command, with the project slug and the new
  token filled in:

  ```sh
  claude mcp add --transport http spec-hub https://<hub>/mcp/<slug> \
    --header "Authorization: Bearer <token>"
  ```

  The default local scope is private to that developer and that project. A committed
  `.claude/settings.json` allows `mcp__spec-hub__*`, so the read-only tools never prompt (Art.
  3.5).
- **Rationale** (Claude Code docs, verified by the guide agent):
  - A committed `.mcp.json` with `${SPEC_HUB_TOKEN}` would show a missing-variable warning to every
    teammate who hasn't connected yet.
  - Permissions are purely rule-based: `readOnlyHint` doesn't skip prompts, so an allow rule is
    needed.
- **Alternatives**: a committed `.mcp.json` (startup warnings), or MCP OAuth sign-in (layer 4).

## R11. Spec Kit extension packaging

- **Decision**: `packages/extension` is a Spec Kit extension with `id: spec-hub`, no commands, one
  script in `provides.scripts`, and one config template that scaffolds
  `.specify/extensions/spec-hub/spec-hub-config.yml` (`hub_url`, `project`). The hub serves the
  zipped extension at `/extension/spec-hub.zip` for
  `specify extension add --from https://<hub>/extension/spec-hub.zip`.
- **Rationale** (verified in specify-cli 1.1.0 source):
  - A manifest needs at least one of commands, hooks, events, templates or scripts, so scripts
    alone qualify.
  - Install copies the whole directory and restores execute bits.
  - Config templates scaffold to `.specify/extensions/<id>/<name>` (`*-config.yml`) and are never
    overwritten.
  - `--from` accepts a zip with `extension.yml` at the root. It asks for confirmation once, which
    an admin answers interactively.
  - Serving the zip from the hub keeps the extension's version in step with the hub.
- **Alternatives**: the community catalog (fine later), or `--dev` from a checkout of this repo
  (only for us).

## R13. Visual design and graphs

- **Decision**:
  - Lay screens out after the Shadcnblocks admin kit (see [ui.md](ui.md) for the mapping) and write
    every component on MIT shadcn/ui.
  - Draw four read-only graphs with `@xyflow/react` 12: the pipeline, the work map, the dependency
    map, and the feature's versions and dependencies.
  - Lay them out with `@dagrejs/dagre`, except the pipeline, which uses fixed phase columns.
  - Build every graph's nodes and edges with pure functions in `packages/core` from the single
    board response.
- **Rationale**:
  - **License**: the kit forbids redistribution "in a tool or template". The user chose
    reference-only on 2026-10-26, and that is now in constitution 1.1.0, Art. 6.
  - **Fit**: the kit already shows that xyflow suits these screens; its `dashboard-4` dependency
    map and `payment-workflow` canvas are the closest examples.
  - **Layout engine**: dagre is small and synchronous, and handles directed graphs of a few hundred
    nodes. elkjs (0.12) is more capable but larger and asynchronous, which isn't needed at the
    layer-1 scale of 300 nodes.
  - **Consistency**: building the graphs in `packages/core` makes FR-039 (the same rules in every
    view) true by construction, and unit-testable.
- **Alternatives**:
  - Copying the kit: ruled out by its license.
  - Mermaid for the board graphs: no interaction, and no custom nodes.
  - D3 by hand: more code for the same result.
  - elkjs: see above.

## R12. Versions (npm, 2026-10-26)

| Package | Version |
|---|---|
| `@modelcontextprotocol/server` | 2.4.0 |
| `hono` / `@hono/node-server` / `@hono/zod-validator` | 4.13.14 / 2.1.5 / 0.9.1 |
| `better-auth` / `@better-auth/api-key` | 1.7.12 / 1.7.12 |
| `drizzle-orm` / `drizzle-kit` / `pg` | 0.45.4 / 0.31.11 / 8.23.1 |
| `zod` | 4.6.7 (the MCP SDK requires zod 4, and the same version is used everywhere) |
| `react` / `vite` / `@vitejs/plugin-react` | 19.3.1 / 8.3.5 / 6.1.2 |
| `@tanstack/react-router` / `router-plugin` / `react-query` | 1.170.46 / 1.168.48 / 5.105.0 |
| `tailwindcss` / `@tailwindcss/vite` | 4.3.3 |
| `react-markdown` / `remark-gfm` / `rehype-sanitize` / `mermaid` | 10.1.0 / 4.0.1 / 6.0.0 / 12.2.0 |
| `mdast-util-from-markdown` / `mdast-util-gfm` / `micromark-extension-gfm` | 2.1.0 / 3.1.0 / 3.0.0 |
| `vitest` / `tsx` / `typescript` | 5.0.5 / 4.23.15 / 7.0.2 |

| `@xyflow/react` / `@dagrejs/dagre` / `recharts` | 12.12.0 / 3.1.3 / 3.10.1 |
| `@tanstack/react-table` / `cmdk` / `sonner` / `lucide-react` / `date-fns` | 9.3.1 / 1.1.1 / 2.0.8 / 1.61.0 / 4.4.0 |
| `shadcn` (CLI) / `radix-ui` | 4.22.1 / 1.8.1 |
| `@fontsource-variable/geist` / `geist-mono` | 5.3.0 / 5.3.0 |

The MCP SDK ships ESM only (`.mjs`/`.d.mts`), so the workspace uses `"type": "module"` with
`moduleResolution: "bundler"` for the web app and `"nodenext"` for the server. The SDK's types
reference `Buffer`, so the server also needs `@types/node`. The Docker image runs Node 24 LTS.
