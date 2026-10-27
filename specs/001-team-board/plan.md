# Implementation Plan: Team board — see what everyone is working on

**Branch**: `001-team-board` | **Date**: 2026-10-26 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-team-board/spec.md`

## Summary

Layer 1 of Spec Hub: a self-hosted hub, a silent reporter in each clone, and a read-only board on
the web and over MCP. The pilot team is the first adopter.

1. **The reporter**: a POSIX `sh` script shipped as a Spec Kit extension. It runs from four git
   hooks and sends, in the background, a complete picture of the clone's in-flight feature work:
   branches, the features each branch changed, their documents' git content IDs, the author and
   times. It uploads only the documents the hub doesn't have yet.
2. **The hub**: one Hono server on Node backed by Postgres. It stores each clone's latest report and
   checks every uploaded document against its git content ID.
3. **The board**: assembled at read time by pure functions in `packages/core`, from documents parsed
   once with mdast. It is served to a Vite and React app through a typed API, and to agents through
   two read-only MCP tools (`board`, `feature`).

People sign in with GitHub through Better Auth. Agents and the reporter use hashed personal tokens
from Better Auth's API-key plugin. Every request is checked against project membership. The hub
never contacts GitHub or writes to a repository.

## Technical Context

**Language/Version**:
- TypeScript (the `typescript` 7.0 native compiler for type-checking), on Node 24 LTS in the image
  and Node 22.12 or later for local development.
- POSIX `sh` for the reporter, which runs in every team's clone, whatever stack the team uses (see
  Complexity Tracking).

**Primary Dependencies**:
- Server: `hono` 4.13, `@hono/node-server` 2.1, `@hono/zod-validator` 0.9, `zod` 4.6.
- MCP: `@modelcontextprotocol/server` 2.4 (`createMcpHandler`).
- Auth: `better-auth` 1.7 and `@better-auth/api-key` 1.7.
- Data: `drizzle-orm` 0.45, `drizzle-kit` 0.31, `pg` 8.
- Markdown parsing: `mdast-util-from-markdown` 2 and `mdast-util-gfm` 3.
- Web: `react` 19, `vite` 8, `@tanstack/react-router` 1.170, `@tanstack/react-query` 5,
  `tailwindcss` 4, shadcn/ui.
- Document rendering: `react-markdown` 10, `remark-gfm` 4, `rehype-sanitize` 6, `mermaid` 12.
- Graphs and charts: `@xyflow/react` 12.12, `@dagrejs/dagre` 3.1, and shadcn charts (`recharts`
  3.10). The screens and graphs are in [ui.md](ui.md).

All versions are in [research.md R12](research.md).

**Storage**: Postgres 18 through Drizzle (locally the Homebrew `postgresql@18` service; in the image and compose, `postgres:18`), with migrations committed under
`apps/server/src/db/migrations/`.

**Testing**: Vitest 5.
- `packages/core`: unit tests.
- `apps/server`: integration tests against real Postgres, by default the local Homebrew service (`DATABASE_URL`). These include reporter
  end-to-end tests that drive `scripts/spec-hub` in temporary git repositories against an
  in-process hub.
- `apps/web`: one component test for sanitized rendering.

**Target Platform**:
- One Linux container (image `spec-hub`) plus Postgres 18, with `docker-compose.yml` for self-hosting.
  The pilot is deployed with Kamal on the user's host.
- The reporter targets macOS and Linux, and Git for Windows' `sh`.

**Project Type**: Web service with a single-page app, plus a client-side script packaged as a Spec
Kit extension.

**Performance Goals**:
- Hook overhead under 100 ms in the foreground (SC-004).
- A change appears on open boards within 30 s (FR-019), using a 10 s poll.
- A report from the pilot's 124 local branches finishes in under 3 s in the background (measured
  in tasks).

**Constraints**:
- Hooks are silent and fail open (Art. 3.6).
- The hub never writes to a repository and never contacts a git host (FR-033).
- No messages and no prompts (FR-034).
- Request bodies are bounded: manifest 1 MiB, document 512 KiB.

**Scale/Scope**:
- Pilot: 4 people, 1 project, about 10 features in flight, about 110 landed.
- Design ceiling for layer 1: 50 people, 20 projects, 100 features in flight per project.
- About 8 web routes, 2 MCP tools, 3 reporter endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Verdict | How the design meets it |
|---|---|---|
| 1 Git is the content store | Pass | Documents are cached copies keyed by git content ID. The hub has no repository credentials and no outbound calls to git hosts. Pilot backups of Postgres are part of the deploy step (1.4). |
| 2 Generic | Pass | Reads vanilla `specs/<dir>/`. The owner header is optional. Numbering is a project setting. Any MCP client, and any git host on the client side. The pilot specifics (`.githooks`, `bin/worktree`) are handled in adoption steps, not in code. |
| 3 Not annoying | Pass | No messages, no prompts. Hooks print nothing except a once-a-day notice for an error the developer must fix. Connecting takes one command per clone. The read-only MCP tools are pre-allowed. The spec's annoyance-budget table holds. |
| 4 Approvals are human | Pass (layer 1 has no approvals) | Tools are read-only. Content IDs are verified by the hub (R6), which prepares 4.2. |
| 5 Security baseline | Pass (1.1.0) | Sessions and hashed, scoped, revocable tokens. Membership checked on every request. zod validation and body limits. Sanitized rendering plus a strict content security policy. An append-only audit enforced by a database trigger. Secrets in the environment. The web app's files and the extension zip are public, as 5.1 now allows. |
| 6 Stack | Pass (1.1.0) | The listed stack is used as is, with xyflow, dagre and shadcn charts for the graphs and charts (R13). The reporter is POSIX `sh`, as the new row allows (R4). pg-boss is not needed until layer 2 (R8). Kit-derived design only, no copied code (ui.md). |
| 7 Layers and restraint | Pass | No queue, no server-sent events, no LISTEN/NOTIFY, no extra rate limiting, no token expiry, no GitHub integration. Each has a named trigger in research.md. |
| 8 Evidence | Pass | Core unit tests. Server tests against real Postgres. Reporter end-to-end tests. Candidates to promote to `[ci]` in this feature: 3.6 (reporter silence test), 4.3 and 5.3 (audit trigger test, token hashing test). |

**Re-check after Phase 1**: Pass. The design added no new violations. FR-012 was tightened in the
spec (R5) to avoid false in-flight entries. User Story 6 and FR-035 to FR-039 (views and
dependencies) were added at the user's request on 2026-10-26.

## Project Structure

### Documentation (this feature)

```text
specs/001-team-board/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1: reporter-http, mcp-tools, web-api, extension
├── ui.md                # Screens, shared parts, graph views (kit as design reference only)
├── preview.md           # Phase 2: code sketches and architecture, for review
└── tasks.md             # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
pnpm-workspace.yaml  package.json  tsconfig.base.json  biome.json
docker-compose.yml   Dockerfile    .env.example
.claude/settings.json                  # permissions.allow: mcp__spec-hub__* (for dogfooding later)

packages/core/                          # pure TypeScript, no I/O (Art. 6)
  src/manifest.ts                       # ReportManifest zod schema, shared by server and tests
  src/git-object-id.ts                  # gitBlobId(bytes, format)
  src/parse-document.ts                 # parseDocument(text) → DocumentFacts
  src/phase.ts                          # inferPhase(docs) → Phase
  src/owner.ts                          # resolveOwner(...)
  src/board.ts                          # buildBoard(input) → Board (in flight, stale, landed, collisions)
  src/graphs.ts                         # buildPipeline, buildWorkMap, buildDependencyGraph (blocked, critical path, cycles)
  src/index.ts
  test/*.test.ts

packages/extension/                     # the Spec Kit extension (R11), zipped into the image
  extension.yml  config-template.yml  README.md
  scripts/spec-hub

apps/server/
  src/index.ts                          # serve(app) and migrate on start
  src/env.ts                            # zod-validated environment
  src/app.ts                            # Hono composition; exports AppType
  src/db/{client.ts,schema.ts,auth-schema.ts,migrations/}
  src/auth/{auth.ts,session.ts,bearer.ts}
  src/routes/{reporter.ts,board.ts,tokens.ts,projects.ts,members.ts,me.ts,static.ts}
  src/mcp/{handler.ts,tools.ts,format.ts}
  src/services/{ingest.ts,board-query.ts,audit.ts,membership.ts}
  test/{setup.ts,helpers.ts,*.test.ts,reporter/*.test.ts}

apps/web/
  src/routes/                           # TanStack file routes (thin)
  src/features/board/  src/features/feature-detail/  src/features/connect/
  src/features/tokens/ src/features/admin/  src/features/dependency-map/
  src/features/graphs/                  # GraphCanvas, node types, dagre layout (ui.md)
  src/components/                       # FeatureCard, PhaseBadge, StatStrip, InspectorPanel, CopyBlock, …
  src/components/document.tsx           # sanitized markdown and mermaid
  src/lib/{api.ts,auth-client.ts}
  test/document.test.tsx
```

**Structure Decision**: a pnpm workspace with the four packages named in Art. 6. `packages/core`
holds every rule the spec states (phase, ownership, in-flight, collisions, windows) and is shared
with tests, so the board's behaviour is unit-tested without a database. The server builds the web
app into `apps/server/public/` at image build time, and serves it together with the extension zip.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| The reporter is POSIX `sh`, not TypeScript (Art. 6 "TypeScript end to end") | It runs in every member's clone, in teams on any stack. `git`, `curl` and `sh` are the only tools guaranteed wherever Spec Kit runs (R4). | A TypeScript reporter needs Node on every developer machine, which a Go or Python team may not have. A compiled binary needs per-platform builds and distribution. |
| `/`, the web app's files and `/extension/spec-hub.zip` are served without authentication (Art. 5.1) | The sign-in page and `specify extension add --from` must work before anyone has a session. They contain code only, never project data. | Gating them would make sign-in impossible. |

Both deviations are covered by **constitution amendment 1.1.0**, which the user approved on
2026-10-26 and which is now applied. The same amendment adds xyflow, dagre and shadcn charts to the
stack, and makes licensed templates design references only.
