# Implementation Plan: Coordination over MCP

**Branch**: `002-mcp-coordination` (work happens on `main`) | **Date**: 2026-10-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-mcp-coordination/spec.md`

## Summary

002 lets agents coordinate through the hub on their own: they claim numbers, read each other's
contracts and previews, read their inbox, ask owners for agreement and check the gate before plan and
implement. People see something only when they must decide or someone objected. Reviews and
approvals are there for teams that want them, and are off until a project turns them on.

The build adds to 001 and changes none of its behaviour:

- **Server:** one migration with six tables and a few columns, nine MCP tools, a handful of
  session routes for the dashboard, and one token permission.
- **Core:** pure functions for the policy file, the gate and the inbox.
- **Reporter:** a few more fields in the manifest: the config file's blob, the preview, contract
  files and sequence numbers.
- **Extension:** three Spec Kit command files wired as hooks. Each one does nothing when the agent
  has no Spec Hub MCP server.
- **Web:** an inbox page with a count in the navigation, a Reviews panel on the feature page, and
  Preview and Contracts tabs.

Nothing runs in the background. There are no jobs and no messages, so pg-boss stays unused.

## Technical Context

**Language/Version**: TypeScript on Node 24 (type stripping); POSIX sh for the reporter.

**Primary Dependencies**: all already in the workspace: Hono, MCP TypeScript SDK, Drizzle, Better
Auth api-key plugin, zod, React, TanStack Router and Query, react-markdown, mermaid. One new web
dependency: `diff` (jsdiff) for "changed since" views (research R11).

**Storage**: Postgres 18; one Drizzle migration `0004_coordination`.

**Testing**: Vitest. Core is unit-tested, server tests run against real Postgres, and reporter tests
run end to end against an in-process hub (constitution Art. 8).

**Target Platform**: the existing single Docker image.

**Project Type**: web service + SPA + Spec Kit extension (the 001 monorepo).

**Performance Goals**: the gate check returns in under 1 s (SC-006); a claim returns in under 1 s;
the hook path stays under 100 ms (001 SC-004, unchanged because the new reporter work runs in the
background).

**Constraints**: zero new prompts with no configuration (SC-011); every agent-side step is silent and
fails open (Art. 3.6); no approval path for agents or tokens (Art. 4.1, SC-005).

**Scale/Scope**: one organisation, projects of up to about 20 people and a few hundred features. The
pilot has 4 people, 89 specs, 81 contract folders and 69 previews.

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1. Both pass.*

| Article | How this plan meets it |
|---|---|
| 1.1 Git is the content store | New tables hold coordination state only (requests, decisions, claims, go-ons). Document content stays content-addressed by blob id, as in 001. |
| 1.2 / 1.3 Never write to the repo | No new write path to any repository or git host. |
| 1.4 Losing the DB loses history, not content | Unchanged. |
| 2.1 Vanilla Spec Kit | Owner and Depends on stay optional; preview and contracts are read when present (FR-039). The claim and gate hooks are Spec Kit's own extension hooks. |
| 2.2 No house rules in core | The core knows requests, decisions, agreements, claims and go-ons only. |
| 2.3 Policy in the repo, defaults for every key | The quorum and sequences live in `spec-hub-config.yml`. Every key has a default, and the default turns approvals off (R1, R2). |
| 2.4 Any MCP client | Everything is an MCP tool. The session-start line is a documented optional extra (R12). |
| 3.1 No manual status | Unchanged. |
| 3.2–3.4 Messages | This feature sends none (FR-029). The inbox is derived, so there is one item per request by construction (R14). |
| 3.5 One extra prompt at most | The hooks are silent. The one possible prompt is the review offer, made only when the hub says so (R6). |
| 3.6 Client pieces silent, fail open | Commands do nothing without the MCP server or when the hub is down. The reporter's new work is in the background path. Covered by the existing `[ci]` reporter tests, extended. |
| 3.8 Annoyance budget | Matches the spec's budget; see the Annoyance Budget check below. |
| 4.1 Approvals are human | No MCP tool decides anything. Decision routes need a session, and the token middleware never reaches them. Tested by SC-005's sweep. |
| 4.2 Bound to the blob id | Every request, decision and go-on stores the oid. |
| 4.3 Append-only record | `decision` gets a trigger that refuses UPDATE. A correction is a new row. |
| 4.4 Self-approvals visible | `decision.self` is set at insert and shown wherever decisions show. |
| 5.1 / 5.2 Auth and membership | Tools sit behind the existing `requireToken` and `requireMember`; session routes behind `requireSession` and `requireProjectRole`. |
| 5.3 Tokens | One new permission, `coordinate`. Existing tokens get it in the migration (R7). |
| 5.4 Validation | zod on every tool argument and body; the config parser is bounded and strict; manifest additions are bounded. |
| 5.5 Content is untrusted | Contract and preview text go to agents framed as data (reusing `formatDocument`), and render sanitized; Mermaid uses `securityLevel: 'strict'` as in 001. |
| 6 Stack | No change. `diff` is a library inside the existing stack. |
| 7.1 Layers | Seven slices, each one shippable on its own (see Delivery order). |
| 7.3 Simplest | The inbox is derived, not stored; claims lapse when read, with no job; no notification code. |
| 7.4 No speculative complexity | Three spots raised for review instead of built quietly (preview.md, Assumptions 5–7). |
| 8 Evidence | Core unit tests; Postgres-backed server tests; reporter end-to-end tests. |

**Annoyance budget check (Art. 3.8):**

- **No configuration:** zero prompts and zero messages.
- **Approvals on:** at most one prompt, the review offer.
- **Every request:** exactly one inbox item per person asked.
- **Joining:** no new setup step, because existing tokens gain `coordinate`.

## Project Structure

### Documentation (this feature)

```text
specs/002-mcp-coordination/
├── spec.md
├── plan.md              # this file
├── research.md          # decisions R1–R16
├── data-model.md        # tables, states, derived inbox and gate
├── contracts/
│   ├── mcp-tools.md     # the nine agent tools and their answers
│   ├── http-api.md      # dashboard routes and the session-line route
│   └── extension.md     # config keys, manifest additions, Spec Kit commands and hooks
├── quickstart.md        # end-to-end validation
├── preview.md           # sketches and diagrams for review
└── tasks.md             # /speckit-tasks, not created here
```

### Source Code

```text
packages/core/src/
├── policy.ts            # NEW parsePolicy(text) → Policy | errors (flat keys)
├── gate.ts              # NEW evaluateGate(...) → GateResult
├── inbox.ts             # NEW buildInbox(...) → { needsYou, updates, waitingOn }
├── manifest.ts          # + default.config, preview, contracts, sequences
└── index.ts

apps/server/src/
├── db/schema.ts                     # + review_request, decision, agreement_request,
│                                    #   number_claim, go_on, clone_contract; 3 new columns
├── db/migrations/0004_coordination.sql
├── services/coordination.ts         # NEW requests, decisions, agreements, go-ons, claims
├── services/ingest.ts               # + config oid, preview, contracts, sequences
├── services/board-query.ts          # + preview and contract docs in FeatureDetail
├── auth/bearer.ts                   # + c.var.permissions (read | report | coordinate)
├── mcp/handler.ts                   # + 9 tools
├── mcp/format.ts                    # + formatInbox, formatGate, formatContracts
├── routes/coordination.ts           # NEW session routes for the dashboard + inbox summary
└── routes/tokens.ts                 # new tokens get coordinate

packages/extension/
├── extension.yml                    # + commands and hooks
├── commands/claim.md                # NEW before_specify, silent
├── commands/gate.md                 # NEW before_plan, before_implement, silent unless needed
├── commands/after.md                # NEW after_specify, after_plan: offers a review only when told
├── config-template.yml              # + commented policy and sequence keys
└── scripts/spec-hub                 # + config oid, preview, contracts, sequences; `inbox --line`

apps/web/src/
├── features/inbox/                  # NEW inbox page, nav count query
├── features/feature-detail/reviews-panel.tsx   # NEW requests, decisions, go-ons, decide buttons
├── features/feature-detail/changed-since.tsx   # NEW line diff between two versions
├── features/feature-detail/document-tabs.tsx   # + Preview and Contracts tabs
├── features/admin/settings-tab.tsx  # + the parsed policy and any config errors
└── routes/_app.p.$slug.inbox.tsx    # NEW
```

**Structure Decision**: the 001 layout, unchanged. Pure rules go in `packages/core` (policy, gate,
inbox); I/O goes in `apps/server/src/services`; the reporter and the hook commands go in
`packages/extension`.

## Delivery Order

Each slice is shippable on its own and keeps the product working (Art. 7.1). The agent-first slices
come first, matching the spec's P1 stories.

1. **Plumbing:** migration, the `coordinate` permission, and the manifest additions with their
   ingest (the config oid, preview, contracts, sequences). Nothing user-visible yet.
2. **Claims** (US4): `claim_number`, `release_number`, the `claim.md` hook, and advisory locking.
3. **Contracts and preview** (US8, US9): `contracts` tool, `feature … document: preview`, and the
   Preview and Contracts tabs.
4. **Agreements and inbox** (US5, US2, US7): `ask_agreement`, `inbox`, the inbox page and nav count,
   answering on the dashboard.
5. **Gate** (US3): policy parsing, `check_gate`, `go_on`, `gate.md`, and the admin settings view.
   With no config, the gate only reports objections and declines.
6. **Reviews and decisions** (US1, US6): `request_review`, `withdraw_request`, the Reviews panel,
   approve, object and withdraw, changed-since, and `after.md`.
7. **Session line** (FR-028): `spec-hub inbox --line` and the documented Claude Code SessionStart
   snippet.

## Complexity Tracking

No constitution violations to justify.
