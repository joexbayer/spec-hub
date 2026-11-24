# Implementation Plan: Mark a spec as done

**Branch**: `006-hide-branch` (stacked on `feat/team-visibility`) | **Date**: 2026-11-24 |
**Spec**: [spec.md](spec.md)

## Summary

A member marks a feature done. The hub records every document version (spec, plan, tasks oids) the
project's clones currently report for that folder. A reported copy of that folder whose version is
recorded is dropped in the one query every view is built from (`loadVersionRows`), so board, work
map, dependency views, feature page and MCP follow without their own changes. A copy with new
document text is not recorded, so new work counts again on its own. The feature page and MCP
`feature` say who marked it and when; Undo removes the mark.

This replaces the first build's branch hiding (same PR): its routes, UI and table go.

What the build has:

- **Database**: migration `0008_feature_done`: drop `branch_hide`, create `feature_done (project_id,
  dir, docs_key, done_by, done_at)`.
- **Server**: `POST`/`DELETE /api/projects/:slug/features/:dir/done` (any member); `loadVersionRows`
  joins `feature_done` on `(project, dir, docs_key)`; `FeatureDetail.done`; MCP `feature` line.
  Removed: `hide.ts`, the hidden-branches routes, `FeatureDetail.hidden`.
- **Web**: `useMarkDone(slug)` (mark/undo, toast with Undo); board row menu: Copy link, Mark as done;
  feature page: "Mark as done" button, or "Marked done by @x" with Undo. Removed: branch items in the
  row menu, the work-map branch menu, the feature page's branch ⋯ and Hidden branches.
- **Constitution**: Art. 3.1's 1.2.0 exception reworded for marks.
- **Reporter**: unchanged.

## Technical Context

**Language/Version**: TypeScript on Node 24. **Dependencies**: none new. **Storage**: Postgres 18;
migration 0008. **Testing**: Postgres-backed server tests, web component tests. **Performance**: one
left join on a primary key. **Constraints**: member-only (Art. 5.2); no notifications (Art. 3.2).

## Constitution Check

| Article | How this plan meets it |
|---|---|
| 3.1 Nothing by hand | **Amended** (1.2.0): a member may mark a feature done at its reported document versions; phase, progress, owner and staleness stay inferred from what remains. |
| 3.2 Messages | None. |
| 5.2 Authorization | Both routes: `requireSession` + `requireProjectRole()`. |
| 5.4 Input | `dir` validated like the feature route; marking a folder with no in-flight copy is a 404. |
| 7.2 No shims | Branch hiding removed outright; its table dropped by migration (it shipped to one hub the same day). |
| 7.3–7.4 Restraint | One table, one join, no history, no expiry. |
| 8 Evidence | Server tests per acceptance scenario; web tests for the menu, the button and Undo. |

## Project Structure

```text
specs/006-mark-done/{spec, plan, research, data-model, quickstart, preview, tasks}.md, contracts/
.specify/memory/constitution.md
apps/server/src/db/{schema.ts, migrations/0008_feature_done.sql}
apps/server/src/services/{board-query.ts, done.ts (new), hide.ts (removed)}
apps/server/src/routes/board.ts
apps/server/src/mcp/{format.ts, handler.ts}
apps/web/src/features/done/{use-mark-done.ts (new)}, features/hide/ → copy-link.ts moves to done/
apps/web/src/features/board/{feature-list.tsx, board-page.tsx}
apps/web/src/features/graphs/nodes.tsx
apps/web/src/features/feature-detail/{feature-page.tsx, graph-panels.tsx}
```

## Complexity Tracking

None.
