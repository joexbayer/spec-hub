# Implementation Plan: Hide a leftover branch

**Branch**: `006-hide-branch` (stacked on `feat/team-visibility`) | **Date**: 2026-11-24 |
**Spec**: [spec.md](spec.md)

## Summary

A member can hide a branch at the tips the hub has for it now. Hidden copies are dropped in the one
query every view is built from (`loadVersionRows`), so board, work map, dependency views, feature
page and MCP all follow without their own changes. A new tip is simply not in the hide, so new work
counts again on its own. The feature page and MCP `feature` list the hidden branches with who hid
them and when; anyone can show them again.

What the build has:

- **Database**: migration `0007_branch_hide`, table `branch_hide (project_id, branch, tip,
  hidden_by, hidden_at)`.
- **Server**: `POST`/`DELETE /api/projects/:slug/hidden-branches` (any member);
  `loadVersionRows` returns `tip` and the matching hide; `loadBoard` and `loadFeature` drop hidden
  rows; `FeatureDetail.hidden`; MCP `formatFeature` lists hidden branches.
- **Web**: a shared `useHideBranch` mutation with an Undo toast; a board-row context menu listing
  the feature's branches; a work-map branch context menu; on the feature page a menu button per
  branch and a "Hidden branches" list with "Show again". New `ui/context-menu.tsx` (shadcn, on the
  existing `radix-ui` package).
- **Constitution**: Art. 3.1 gains the named exception; version 1.2.0.
- **Reporter**: unchanged.

## Technical Context

**Language/Version**: TypeScript on Node 24.

**Primary Dependencies**: already in the workspace (`radix-ui` 1.8.1 has ContextMenu). No new
dependency.

**Storage**: Postgres 18; migration 0007.

**Testing**: Postgres-backed server tests (routes, board query, MCP); web component tests.

**Performance Goals**: the board query gains one left join on a primary key; no measurable change.

**Constraints**: hides are project-scoped and member-only (Art. 5.2); no notifications (Art. 3.2).

**Scale/Scope**: pilot: a handful of hides at a time.

## Constitution Check

| Article | How this plan meets it |
|---|---|
| 1.x Git is the store | Nothing about git changes; a hide filters what clones reported. |
| 3.1 Nothing by hand | **Amended** (1.2.0): a member may hide a branch at given tips. Phase, progress, owner and staleness stay inferred from the remaining reports; a hide never sets them. |
| 3.2 Messages | No message on hide. |
| 3.6 Silent reporter | Reporter unchanged. |
| 5.2 Authorization | Both routes use `requireSession` + `requireProjectRole()`; hides are read only inside the member-guarded board/feature/MCP paths. |
| 5.4 Input | Branch name validated (1–255, no control characters); hiding a name with no reported copy is a 404. |
| 7.2 No shims | One filter at the source; no per-view flag. |
| 7.3–7.4 Restraint | No hide history, no audit-log entry (not a security event), no expiry job: a moved branch makes a hide inert by itself. |
| 8 Evidence | Server tests for every acceptance scenario; web tests for the three entry points and Show again. |

## Project Structure

```text
specs/006-hide-branch/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, preview.md
├── contracts/interfaces.md
└── tasks.md                       # /speckit-tasks

.specify/memory/constitution.md                      # Art. 3.1 exception, 1.2.0
apps/server/src/db/{schema.ts, migrations/0007_*}
apps/server/src/services/{board-query.ts, hide.ts}
apps/server/src/routes/board.ts                      # hidden-branches routes
apps/server/src/mcp/format.ts
apps/web/src/components/ui/context-menu.tsx
apps/web/src/features/hide/{use-hide-branch.ts, copy-link.ts}
apps/web/src/features/board/{feature-list.tsx (row), board-page.tsx + graphs branch node (work map)}
apps/web/src/features/feature-detail/graph-panels.tsx
apps/server/src/mcp/handler.ts                       # a hidden-only feature by directory name
```

## Complexity Tracking

None.
