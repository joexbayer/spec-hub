# Implementation Plan: Finished features on the hub

**Branch**: `005-finished-features` (stacked on `fix/review-findings`, PR #1) | **Date**: 2026-11-23 |
**Spec**: [spec.md](spec.md)

## Summary

A connected clone already tells the hub which folders are on the default branch (`default.dirs`).
It now also sends, when the default branch has moved since the hub last heard, each folder's
documents, owner and landing time (`default.features`, optional). Documents travel through the
existing content-addressed upload, so each is sent once per project. The hub keeps the newest
listing on the existing `landed_feature` rows, removing folders the default branch no longer has.

On top of that: a finished features page (search and owner filter in the URL), the default branch
as one more version on the feature page, links from "Recently landed", and an MCP `finished` tool
plus a `branch` argument on `feature`. The board does not change.

What the build has:

- **Database**: migration `0005_finished_features`: facts columns on `landed_feature`,
  `finished_tip`/`finished_tip_at` on `project`.
- **Core**: manifest schema (`default.features`), `uploadableOids` over it, `buildFinished`.
- **Reporter**: the listing in `build_manifest`, skipped when the hub already has that tip.
- **Server**: ingest step `storeFinished`, `GET /finished`, `loadFeature` with the default branch
  version, `/config` `finishedTip`, MCP `finished` and `feature` changes.
- **Web**: finished page and route, feature page picker, board links.
- **Docs**: spec 001's reporter and extension contracts, the extension README, the
  `reporter-testing` skill.

Additive on the wire: older reporters keep working; one updated member fills the list (research F1).

## Technical Context

**Language/Version**: TypeScript on Node 24 (type stripping); POSIX sh for the reporter.

**Primary Dependencies**: already in the workspace: Hono, Drizzle, zod, MCP TypeScript SDK, React,
TanStack Router and Query. No new dependency.

**Storage**: Postgres 18; migration `0005_finished_features`.

**Testing**: Vitest unit tests (core), Postgres-backed server tests (ingest, routes, MCP), reporter
end-to-end tests against an in-process hub and real git repositories, web component tests.

**Target Platform**: the hub (Linux container); the reporter on macOS and Linux, git ≥ 2.31.

**Performance Goals**: an unchanged default branch costs a report nothing extra (SC-003); a moved one
adds ~1.1 s of git in the background on the pilot (F3, F4); the first full upload completes in the
first report on a normal connection (SC-004).

**Constraints**: reporter silent, fail open, foreground hook untouched (Art. 3.6); the hub never
contacts a git host (Art. 2.5); 1 MiB manifest, 512 KiB document limits (spec 001 FR-010).

**Scale/Scope**: the pilot has 136 folders and 406 documents (9.1 MiB) on `main`; limit 2,000
folders per listing (F7).

## Constitution Check

| Article | How this plan meets it |
|---|---|
| 1.1–1.4 Git is the store | The hub caches documents clients report, as it does for branches; it writes nothing to a repo; losing the database loses only the cache. |
| 2.1 Vanilla Spec Kit | Reads `specs/<dir>/{spec,plan,tasks}.md` only; owner header optional. |
| 2.3 Policy in the repo | No new setting. |
| 2.4 Any MCP client | Plain tools and text answers. |
| 2.5 Any git host | Data comes from the clone's own `origin/<default>`; no host API. |
| 3.1 Nothing by hand | Landing time, owner and tasks are inferred. |
| 3.6 Silent, fail open | No new output; all work in the background report; same failure handling. |
| 3.8 Annoyance budget | No messages, prompts or steps added (spec, "Annoyance budget"). |
| 5.2 Membership | New route and tool behind the board's guards; rows scoped by project. |
| 5.4 Validation | `features` validated by zod with count, size and oid-format bounds; blobs hash-checked as today. |
| 5.5 Untrusted content | Documents rendered by the existing sanitized renderer; MCP text through `oneLine()` and the existing fenced document format. |
| 7.2 No shims | The optional field is not a shim: old reporters are external, installed clients (engineering rule 1 does not license breaking them). Nothing in this codebase keeps a dead path. |
| 7.3–7.4 Simplest | Reuses the upload flow, the landed row, `resolveOwner`, the feature page; no batching, no server search, no jobs. |
| 8.1–8.2 Evidence | Core unit tests; Postgres-backed ingest and route tests; reporter end-to-end tests. |

Post-design re-check: no violations; nothing for Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/005-finished-features/
├── spec.md
├── plan.md            # this file
├── research.md        # F1–F10
├── data-model.md
├── contracts/
│   ├── reporter.md    # manifest, /config, reporter behaviour
│   ├── web.md         # API and UI
│   └── mcp.md         # finished, feature
├── quickstart.md
├── preview.md         # code sketches for review
└── tasks.md           # /speckit-tasks
```

### Source Code (repository root)

```text
packages/core/src/
├── manifest.ts             # DefaultFeature, default.features, uploadableOids
├── finished.ts             # buildFinished (new)
├── types.ts                # FinishedRow, FinishedFeature
└── index.ts
packages/core/test/          # manifest + finished tests

packages/extension/scripts/spec-hub     # build_manifest: DEFAULT_AWK, skip rule
packages/extension/README.md

apps/server/src/
├── db/schema.ts, db/migrations/0005_finished_features.sql
├── services/ingest.ts      # storeFinished, too-large markers over default docs
├── services/board-query.ts # loadFinished, loadFeature default-branch version
├── routes/board.ts         # GET /finished (beside GET /board)
├── routes/reporter.ts      # /config finishedTip
├── routes/projects.ts      # reset finished_tip on default branch change
└── mcp/handler.ts, mcp/format.ts       # finished tool, feature branch arg
apps/server/test/            # ingest, finished route, mcp, reporter e2e

apps/web/src/
├── routes/_app.p.$slug.finished.tsx    # new
├── features/finished/finished-page.tsx # new
├── features/feature-detail/feature-page.tsx
├── features/board/board-page.tsx, side-rail.tsx
apps/web/test/finished.test.tsx, feature-detail.test.tsx

specs/001-team-board/contracts/{reporter-http,extension,mcp-tools,web-api}.md  # pointers to 005
.claude/skills/reporter-testing/SKILL.md
```

**Structure Decision**: the existing four-package workspace; one new core module, one new web
feature folder, no new server module (the route sits with the board's).

## Complexity Tracking

None.
