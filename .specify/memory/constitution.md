# Spec Hub Constitution

Spec Hub is a self-hosted coordination server for teams that use GitHub Spec Kit: one MCP endpoint
for agents and one web UI for people. It shows who is working on what, routes reviews and records
approvals. The pilot repository is the first adopter; nothing in this file is specific
to it.

**This file is authoritative.** The Spec Kit pipeline reads it. Articles are appended, never
renumbered, so specs and plans can cite a rule as "Art. 3.2".

## Rule States

Every rule carries one of three states. **Promoting a rule to `[ci]` adds its check in the same
change.**

| State | Meaning |
|---|---|
| `[ci]` | A command enforces it. The rule names the command. |
| `[review]` | A human asserts it in review. |
| `[parked]` | Deliberately dormant, with a trigger, an owner and a date. |

No code exists at ratification, so every rule starts as `[review]`. Article 8 says how rules move.

## Core Principles

### Article 1 — Git is the content store

1.1 Spec content (everything under `specs/`) lives in git. The hub holds coordination state only:
reviews, approvals, objections, number claims, notifications, and cached snapshots of what clients
and git hosts report. `[review]`

1.2 The hub never writes to a repository: no commits, branches, PR comments or file edits.
`[review]`

1.3 The only thing the hub may post to a git host is a commit status. `[review]`

1.4 Losing the hub's database loses coordination history, never spec content. The database is
backed up like any production database. `[review]`

Rationale: a second copy of the content drifts, and a tool that edits the repo has to be watched.

### Article 2 — Generic

2.1 The core reads vanilla Spec Kit: `specs/<id>-<slug>/{spec,plan,tasks}.md`, with sequential or
timestamp numbering. Headers such as `Owner` and `Depends on` are used when present and never
required. `[review]`

2.2 No project's house rules enter the core. The pilot's own house rules, such as on-behalf ticks and
its landing script, belong to the pilot. The core knows review requests, approvals, objections and
agreement requests. `[review]`

2.3 Project policy lives in the project's own repo, in the Spec Hub extension config. Every key has
a default, and a project with no config works. `[review]`

2.4 Any MCP client works. Agent-specific extras (Claude Code hooks, MCP Apps, channels) are
optional additions, never requirements. `[review]`

2.5 The client-reported path works with any git host. Host integrations (GitHub first) add to it and
never replace it. `[review]`

2.6 Any LLM provider works, and the hub works with none: AI features become unavailable, not
broken. `[review]`

### Article 3 — Not annoying

The tool fails the moment people mute it. This article is the product's main constraint, not a
style preference.

3.1 Nobody updates status by hand. Phase, progress, owner and staleness are inferred from what the
repo and its clients already report. `[review]`

3.2 Immediate messages go out only when someone must act: they are asked to review, a change is
requested or an objection is raised on their feature, or their feature is unblocked. Everything
else goes on the board and into one morning digest. `[review]`

3.3 The digest is skipped when empty and never sent outside the recipient's working hours.
`[review]`

3.4 A message about one thing is updated in place, not followed by new messages. There is at most
one reminder per request. Nobody is notified about their own actions. `[review]`

3.5 No Spec Kit command gets more than one extra prompt. `[review]`

3.6 Client-side pieces (hooks, the reporter, session checks) print nothing on success, never block
local work, and fail open when the hub is unreachable. `[ci]`
`pnpm --filter @spec-hub/server exec vitest run test/reporter` (unchanged commit output, hook under
the time budget, silent and successful with the hub down).

3.7 AI speaks only when asked: no unrequested AI comments, and nothing is generated on every push.
`[review]`

3.8 Every spec states its effect on the annoyance budget, and no plan exceeds it without an
amendment: `[review]`
- a person with nothing to act on gets **zero** messages that day;
- a review request produces **exactly one** message per reviewer;
- no Spec Kit command gets more than **one** extra prompt;
- a new developer is connected in **under 2 minutes**.

### Article 4 — Approvals are human

4.1 No MCP tool, API token or agent path can approve, object or self-approve. These actions need a
signed-in person: in the web UI, or in a chat integration that maps the click to that person.
`[review]`

4.2 An approval is bound to the git content ID (blob ID) of the document that was approved. Whether
a later change needs re-approval is project policy; either way the record shows exactly what was
approved and what changed since. `[review]`

4.3 Every approval, objection, withdrawal and self-approval records actor, time, content ID and
reason. The record is append-only: a correction is a new entry. `[review]`

4.4 A self-approval is always visible as one, on the board and in the record. `[review]`

### Article 5 — Security baseline

5.1 Every endpoint requires authentication, except the health check and webhooks, which are
verified by signature. The hub's own static files (the web app and the extension package) are
public and never contain project data. `[review]`

5.2 Every read and write is authorized against the person's project membership. A person sees only
the projects they belong to. `[review]`

5.3 Personal tokens are stored hashed, scoped and revocable, and each one acts as exactly one
person. `[ci]` `pnpm --filter @spec-hub/server exec vitest run test/tokens.test.ts
test/security-boundaries.test.ts` (hash at rest, permission scope, revocation, one user per key).

5.4 Input is validated at every trust boundary: MCP tool arguments, API bodies, reporter payloads,
webhooks and config files. Sizes are bounded. `[review]`

5.5 Spec content is untrusted. It is rendered sanitized and passed to an LLM only as data, and AI
output never triggers an action or a state change. `[review]`

5.6 Secrets never enter the repo. `[review]`

### Article 6 — Stack

Decided 2026-10-26 on fit for the task: an integration-heavy server whose official SDKs are
TypeScript-first, with one schema shared by MCP tools, the API and the UI. Changing a row needs an
amendment. `[review]`

| Layer | Choice |
|---|---|
| Language | TypeScript end to end, Node LTS |
| Client scripts | POSIX sh with git and curl, so they run in any team's clone |
| Server | Hono |
| MCP | Official MCP TypeScript SDK, stateless transport |
| Data | Postgres and Drizzle; every schema change ships as a migration |
| Jobs | pg-boss (no Redis) |
| Auth | Better Auth: GitHub sign-in for people, API keys for agents and hooks |
| Web | Vite, React, TanStack Router and Query, shadcn and Tailwind |
| Graphs and charts | @xyflow/react with dagre layout; shadcn charts (Recharts) |
| Packaging | One Docker image and a docker-compose file |

The pnpm workspace has `apps/server`, `apps/web`, `packages/core` (pure domain logic, no I/O) and
`packages/extension` (the Spec Kit extension).

UI code is written on MIT-licensed shadcn/ui primitives. Licensed templates, such as the
Shadcnblocks admin kit, are design references only, and no code is copied from them. This keeps
Spec Hub distributable to any team.

Next.js is excluded: it has no jobs, fights long-lived connections, and puts its server-rendering
surface where the approvals are.

### Article 7 — Layers and restraint

7.1 Grow in layers. Every feature leaves a product that works end to end; no feature trades a
working product for unfinished complexity. `[review]`

7.2 No backward-compatibility shims: obsolete paths are removed. Schema migrations are not shims;
Article 6 requires them. `[review]`

7.3 Choose the simplest implementation that fully meets the requirement. Prefer established,
maintained libraries to own code, and dependencies already in the workspace to new ones.
`[review]`

7.4 No speculative complexity for unlikely races or edge cases without the user's buy-in. State the
failure mode, its likelihood and its cost first. This binds specs, plans, reviews and subagents.
`[review]`

7.5 Safety controls (validation, authorization, error handling that prevents data loss, audit) are
never cut as simplification. `[review]`

### Article 8 — Evidence

8.1 `packages/core` logic is unit-tested. `[review]`

8.2 Persistence is tested against real Postgres, not mocks. `[review]`

8.3 Promoting a rule from `[review]` to `[ci]` names the enforcing command in the same change.
`[review]`

## Development Workflow

- The pipeline is specify → clarify → plan → tasks → implement → verify, using the agentic
  extension and preset in `.specify/`. A human approves each artifact before the next stage.
- The plan is the contract: anything not in it is out of scope until the plan is revised.
- The pilot adopts each layer after it ships. Adoption steps specific to the pilot, such as
  retiring its Status-line approvals, happen in the pilot repository, not here. What the pilot teaches comes
  back here as specs.

## Governance

- This constitution overrides other practice in this repo. Where a spec or plan conflicts with it,
  the constitution wins until it is amended.
- An amendment is a change to this file that bumps the version and adds a changelog line. MAJOR: a
  rule removed or redefined. MINOR: a rule or article added or materially widened. PATCH: wording.
- Every plan runs a constitution check against each article, and verify reviews against it.
- A failure pattern seen three times becomes a rule, through the agentic retrospective.

### Changelog

- 1.0.0 — 2026-10-26 — Ratified.
- 1.1.0 — 2026-10-26 — Art. 5.1: the hub's static files are public. Art. 6: POSIX sh for client
  scripts, xyflow, dagre and shadcn charts for graphs, and licensed templates as design references
  only. Raised by the 001 plan.
- 1.1.1 — 2026-10-26 — Art. 3.6 and 5.3 promoted from `[review]` to `[ci]`, naming their test
  commands (001, T056).

**Version**: 1.1.1 | **Ratified**: 2026-10-26 | **Last Amended**: 2026-10-26
