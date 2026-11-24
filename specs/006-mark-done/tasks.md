---
description: "Tasks for 006 Mark a spec as done"
---

# Tasks: Mark a spec as done

**Input**: `specs/006-mark-done/` (spec.md FR-001–FR-011, plan.md, research.md D1–D4,
data-model.md, contracts/interfaces.md, quickstart.md, preview.md)

**History**: T001–T010 (same day) built branch hiding; the spec was revised to marking a spec done
and those tasks are superseded. Their code is removed by T011–T014. Kept from them: the shadcn
`context-menu.tsx`, `copy-link.ts`, the board row menu shell, the constitution amendment (reworded).

**Rules for every task**: project CLAUDE.md (no speculative complexity without buy-in); server tests
in parallel agents use their own `SPECHUB_TEST_DB`; don't run `pnpm check` while other agents test.

## Format: `[ID] [P?] [deps] [Story] @capability [ctx] Description`

## Phase 2: Foundational

- [X] T011 @implementation [ctx: apps/server/src/db/schema.ts:79-110, .specify/memory/constitution.md:69-73, specs/006-mark-done/data-model.md] Schema: remove `branchHide`, add `featureDone` (`feature_done`, data-model.md); generate `0008_feature_done` (drops `branch_hide`, creates `feature_done`) with a one-line header. Constitution Art. 3.1 exception reworded: "Exception (006): a member may mark a feature done at the document versions it is reported at; a marked copy does not count until its documents get new text. A mark never sets phase, progress, owner or staleness." and the 1.2.0 changelog line to match.

## Phase 3: US1–US3 — hub

- [X] T012 [deps: T011] [US1,US2,US3] @reasoning [ctx: apps/server/src/services/board-query.ts, apps/server/src/services/hide.ts, apps/server/src/routes/board.ts, apps/server/src/mcp/{format.ts,handler.ts}, apps/server/test/{hide,mcp,mcp-format}.test.ts, specs/006-mark-done/preview.md §1-2] Server: replace `hide.ts` with `done.ts` (`docsKey` sql expression exported and used by both the join and `markDone`; `markDone`, `unmarkDone`); `loadVersionRows` joins `feature_done` on (project, dir, docsKey) instead of `branch_hide`; `FeatureDetail.done` replaces `hidden`; routes `POST`/`DELETE /projects/:slug/features/:dir/done` replace the hidden-branches routes; MCP `formatFeature` prints the done line instead of hidden lines (handler fallback for a folder whose only copies are marked stays). Tests: `apps/server/test/done.test.ts` replaces `hide.test.ts` (quickstart scenarios 1–8 plus cross-project isolation), MCP tests updated (scenario 9).

## Phase 4: Web

- [X] T013 [deps: T012] [US1,US4] @implementation [ctx: apps/web/src/features/hide/*, apps/web/src/features/board/feature-list.tsx:120-200, apps/web/src/features/board/board-page.tsx:300-380, apps/web/src/features/graphs/nodes.tsx:160-215, apps/web/test/{hide,board,graphs}.test.tsx] Web: `apps/web/src/features/done/use-mark-done.ts` (`useMarkDone(slug)` → `{ mark, undo }`; mark takes `{ dir, title }`, toast `Marked <title> as done.` with Undo; invalidates `['board', slug]`, `['feature', slug]`) and move `copy-link.ts` there; delete `features/hide/`; board row menu = Copy link, separator, Mark as done (CircleCheck); remove the work-map branch menu (`onHide` in nodes.tsx and board-page.tsx). Tests updated (`done.test.tsx` replaces `hide.test.tsx`; board and graphs tests).
- [X] T014 [deps: T013] [US3] @implementation [ctx: apps/web/src/features/feature-detail/feature-page.tsx:180-300, apps/web/src/features/feature-detail/graph-panels.tsx:1-120, apps/web/test/feature-detail.test.tsx, apps/web/test/feature-graphs.test.ts] Feature page: remove the branch ⋯ menu and Hidden branches; header gets `Mark as done` (when `entry` is set) or the done line with Undo (contracts); fixtures use `done: null`. Tests: button marks, done line + Undo deletes, a marked-only feature renders.

## Phase 6: Polish

- [X] T015 [P] [deps: T014] @implementation Docs: README "Leftover branches" → "Done specs"; spec 001 web-api pointer to `specs/006-mark-done/contracts/interfaces.md`.
- [ ] T016 [deps: T015] @routine Run `pnpm check` with the machine quiet; re-run any failing test alone; report.

## Dependencies

T011 → T012 → T013 → T014 → T015 → T016.
