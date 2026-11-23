# Implementation Plan: Teammates' pushed work on the board

**Branch**: `feat/team-visibility` (stacked on `005-finished-features`) | **Date**: 2026-11-23 |
**Spec**: [spec.md](spec.md)

## Summary

Two changes to what a clone reports, plus their display:

1. **For every report (FR-014)**: a branch carries a feature only when one of its documents has a
   version the default branch never had. This replaces the commit-based landed check that deploy
   branches and squash merges defeat. On the pilot it removes `chore/production`'s 24 stale
   features and keeps only `chore/staging`'s two real ones; feature 150 leaves "in flight".
2. **With the new project option on (FR-001 – FR-013)**: a connected clone also reports teammates'
   pushed branches from the last 14 days, flagged as remote. The hub keeps one copy per branch,
   lets the author's own clone win, and never shows them as the reporting person's work.

Remote results are cached between fetches (research P3): measured 12 s for the pilot's 34 recent
branches, so the work happens once per fetch, not on every commit.

What the build has:

- **Database**: migration `0006_share_pushed_branches` (`project.share_pushed_branches`,
  `clone_branch.remote`).
- **Core**: settings schema, manifest `remote`, `buildBoard` dedupe with nullable carrier,
  `buildWorkMap` "Shared remote" node.
- **Reporter**: content-based keep check (all reports); remote branch pass with cache (option on).
- **Server**: settings PATCH, `/config` `sharePushedBranches`, ingest `remote`, MCP wording.
- **Web**: settings switch; remote labels on the feature page, work map and dependency details.

## Technical Context

**Language/Version**: TypeScript on Node 24; POSIX sh for the reporter.

**Primary Dependencies**: already in the workspace. No new dependency.

**Storage**: Postgres 18; migration 0006.

**Testing**: core unit tests; Postgres-backed server tests; reporter end-to-end tests with real git
(deploy-branch tree copies, squash merges, remote branches, cache); web component tests.

**Performance Goals**: the foreground hook unchanged; the background report adds ≤ 1 s when no fetch
happened (cache hit plus the content check's one `git log`), and ~12 s once per fetch on the pilot.

**Constraints**: reporter silent, fail open, git + curl only, never contacts the remote (Art. 2.5,
3.6); 1 MiB manifest, 500 branches.

**Scale/Scope**: pilot: 304 unmerged remote branches, ~34 active in 14 days, 4 members.

## Constitution Check

| Article | How this plan meets it |
|---|---|
| 1.x Git is the store | Only what clones already have is reported; the hub never contacts git hosts. |
| 2.3 Policy in the repo | Deviation, recorded in the spec's assumptions: the option is a hub project setting, like the default branch and numbering (spec 001 FR-027), because one toggle must reach every clone at once and it is a choice about what the team's hub shows. |
| 2.5 Any git host | Reads `refs/remotes/<remote>/*` from the clone only. |
| 3.1 Nothing by hand | Owners and dedupe are inferred. |
| 3.6 Silent, fail open | No new output; any git failure in the remote pass or the content check falls back to today's report. |
| 3.8 Annoyance budget | No messages; one switch in settings. |
| 5.2, 5.4 | Settings PATCH stays admin-only; manifest `remote` is a bounded literal. |
| 7.2 No shims | The old cherry-pick check is removed, not kept beside the new one. |
| 7.3–7.4 | One cache file justified by a measurement (P3); no per-branch cache, no ignore list. |
| 8 Evidence | Core, Postgres-backed and reporter end-to-end tests, including the pilot's deploy-branch pattern. |

## Project Structure

```text
specs/004-pushed-branch-sharing/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, preview.md
├── contracts/interfaces.md
└── tasks.md                       # /speckit-tasks

packages/core/src/{project.ts, manifest.ts, types.ts, board.ts, graphs.ts}
packages/extension/scripts/spec-hub              # KEEP check by content; remote pass + cache
apps/server/src/db/{schema.ts, migrations/0006_*}
apps/server/src/services/{ingest.ts, board-query.ts}
apps/server/src/routes/{reporter.ts, projects.ts}
apps/server/src/mcp/format.ts
apps/web/src/features/admin/settings-tab.tsx, create-project-dialog.tsx
apps/web/src/features/feature-detail/{feature-page.tsx, graph-elements.ts}
apps/web/src/features/dependency-map/feature-details.tsx
specs/001-team-board/contracts/*  (pointers), packages/extension/README.md, reporter-testing skill
```

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
|---|---|---|
| Remote-lines cache file | 12 s of git per commit on the pilot otherwise | No cache: every commit's background report burns 12 s of CPU re-checking unchanged branches |
