# Implementation Plan: Landing lock

**Branch**: `003-landing-queue` (work happens on `main`) | **Date**: 2026-10-29, revised 2026-10-30 |
**Spec**: [spec.md](spec.md)

## Summary

Agents take turns landing. An agent asks the hub for the project's landing lock over MCP; the hub
grants it or queues the agent, first come, first served. The agent keeps asking until it holds the
lock, gates, lands and opens the lock. A forgotten lock opens after 60 minutes, or when any member
opens it on the dashboard. The hub never runs gates and never touches a repository.

What the build has:

- **Database**: one table, `land_place`, in migration `0004` (rewritten for the revision; never
  applied outside tests).
- **Core**: `advance` (lapse, skip, expire, grant) and `estimateMinutes`, pure.
- **Server**: the queue service; three MCP tools; two dashboard session routes.
- **Web**: a Landing page linked from the project navigation.

No jobs: the queue advances whenever someone calls (research L1). Independent of 002.

**Revision (2026-10-30)**: the first draft held turns with a shell command (`spec-hub land wait`)
and a background check-in. That code was built (MVP) and is removed by this plan: the `land`
command, the two reporter routes and their tests. See research L14–L19.

## Technical Context

**Language/Version**: TypeScript on Node 24 (type stripping).

**Primary Dependencies**: already in the workspace: Hono, MCP TypeScript SDK, Drizzle, zod, React,
TanStack Router and Query. No new dependency.

**Storage**: Postgres 18; migration `0004_landing_queue`.

**Testing**: Vitest unit tests for `advance`/`estimateMinutes`; server tests against real Postgres for
the service, the MCP tools (including a blocking ask woken by an unlock and concurrent asks) and the
dashboard routes; web tests for the page.

**Performance Goals**: a waiting ask notices an open lock within 5 s (2 s re-check); every ask
answers within 25 s.

**Constraints**: MCP answers under 30 s (proxy timeout); no output or change for non-users; the hub
never touches a repository.

**Scale/Scope**: up to about 20 people a project, a few dozen lands a day, rarely more than 5 waiting.

## Constitution Check

| Article | How this plan meets it |
|---|---|
| 1.1–1.4 Git is the store; never write to the repo | `land_place` is coordination state only; the hub reads nothing from git. |
| 2.1–2.5 Vanilla Spec Kit, any client, any host | MCP tools work with any MCP client; no Spec Kit hooks or extension changes; no host, script or merge style assumed. |
| 3.5–3.8 Prompts, silence, annoyance budget | No prompts, hooks or push messages; non-users see nothing. |
| 4.x Approvals | Not touched. The lock tools change only queue state, never approvals (Art. 4.1 stays true: no MCP tool approves or objects). |
| 5.1–5.4 Auth, membership, validation | MCP: `requireToken('read')` + `requireMember()`; dashboard: `requireSession` + `requireProjectRole()`. zod on inputs; ids looked up within the URL's project. |
| 5.5 Untrusted content | Only logins, outcomes and numbers are shown, through `oneLine()`. |
| 7.3–7.4 Simplest, no speculation | One table, no jobs, polling inside one call, no caps, no priorities, no land detection. |
| 8 Evidence | Unit, Postgres-backed and web tests. |

## Project Structure

```text
specs/003-landing-queue/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md · preview.md · tasks.md
└── contracts/
    ├── mcp-tool.md   # land_lock, land_unlock, landing
    └── http-api.md   # dashboard routes

packages/core/src/landing.ts             # advance(), estimateMinutes(), timeouts
apps/server/src/db/schema.ts             # land_state, land_outcome, land_place
apps/server/src/db/migrations/0004_landing_queue.sql
apps/server/src/services/landing.ts      # withQueue, settle, ask, unlock, status, view, endById
apps/server/src/mcp/handler.ts           # + land_lock, land_unlock, landing
apps/server/src/mcp/format.ts            # + formatLanding, lock/wait lines
apps/server/src/routes/landing.ts        # GET …/landing, POST …/landing/:id/end
apps/web/src/features/landing/           # page + query
apps/web/src/routes/_app.p.$slug.landing.tsx

removed: packages/extension/scripts/spec-hub `land` command; reporter routes /:slug/land,
/:slug/land/end; apps/server/test/reporter/land.e2e.test.ts
```

## Delivery order

1. **Revise the MVP to the lock model**: schema and migration per member, core timeouts, service
   (`ask`, `unlock`), remove the shell command and reporter routes; MCP `land_lock`/`land_unlock`
   with tests. This works on its own: agents take turns.
2. **Visibility**: MCP `landing`, the dashboard page with open/remove, README section.

## Complexity Tracking

No constitution violations.
