---
description: "Tasks for 006 Hide a leftover branch"
---

# Tasks: Hide a leftover branch

**Input**: `specs/006-hide-branch/` (spec.md FR-001–FR-013, plan.md, research.md H1–H5,
data-model.md, contracts/interfaces.md, quickstart.md, preview.md)

**Tests**: included (constitution Art. 8).

**Rules for every task**: project CLAUDE.md (no speculative complexity without buy-in); the repo
stays generic; read `spec-hub-dev` for test commands; server tests in parallel agents use their own
`SPECHUB_TEST_DB`.

## Format: `[ID] [P?] [deps] [Story] @capability [ctx] Description`

---

## Phase 2: Foundational

### Wave 1 (parallel)

- [X] T001 [P] @implementation [ctx: apps/server/src/db/schema.ts:79-93, specs/006-hide-branch/data-model.md] DB: `branchHide` table (`branch_hide`: project_id uuid → project cascade, branch text, tip text, hidden_by text → user set null, hidden_at timestamptz default now(), PK (project_id, branch, tip)) in `apps/server/src/db/schema.ts`; generate migration `0007_branch_hide` with a one-line header comment like 0006.
- [X] T002 [P] @routine [ctx: .specify/memory/constitution.md:69-71, .specify/memory/constitution.md:200-220] Constitution: add to Art. 3.1 the exception "Exception (006): a member may hide a branch at the commits it is reported at; a hidden branch's report does not count until the branch has a new commit. A hide never sets phase, progress, owner or staleness."; bump to 1.2.0 with a changelog line dated 2026-11-24 and update **Last Amended**.

## Phase 3: US1/US2/US3 — hub

- [X] T003 [deps: T001] [US1,US2,US3] @reasoning [ctx: apps/server/src/services/board-query.ts:60-180, apps/server/src/services/board-query.ts:257-285, apps/server/src/services/board-query.ts:361-430, apps/server/src/routes/board.ts:1-60, specs/006-hide-branch/preview.md §1-2] Server: `apps/server/src/services/hide.ts` (`hideBranch`, `showBranch` as preview §2); `loadVersionRows` selects `tip` and left-joins `branch_hide` on (project, name, tip); `loadBoard` drops hidden rows; `loadFeature` drops them from `versions`, adds `hidden: HiddenBranch[]` (group by branch, only branches with no visible copy for this dir, earliest hiddenAt, hider's githubLogin/name or null) and returns a detail when only hidden copies exist; routes `POST /projects/:slug/hidden-branches` and `DELETE /projects/:slug/hidden-branches?branch=` in `routes/board.ts` with the existing member guard and a validated branch name. Tests in `apps/server/test/hide.test.ts` covering quickstart scenarios 1–7 (report through the existing helpers in `apps/server/test/helpers.ts`).
- [ ] T004 [deps: T003] [US3] @implementation [ctx: apps/server/src/mcp/format.ts:130-170, apps/server/test/mcp-format.test.ts:110-160, specs/006-hide-branch/contracts/interfaces.md "MCP"] MCP: `formatFeature` prints one line per `detail.hidden` entry after the branches, wording from contracts; tests in `apps/server/test/mcp-format.test.ts` and one end-to-end check in `apps/server/test/mcp.test.ts` that a hidden-only feature is absent from `board`.

## Phase 4: Web

- [X] T005 [deps: T003] @implementation [ctx: apps/web/src/lib/api.ts, apps/web/src/components/ui/dropdown-menu.tsx, apps/web/src/features/landing/landing-page.tsx (a useMutation example)] Web foundation: `apps/web/src/components/ui/context-menu.tsx` (shadcn context-menu on `radix-ui`'s `ContextMenu`, styled like `dropdown-menu.tsx`); `apps/web/src/features/hide/use-hide-branch.ts` (preview §3: hide/show mutations, invalidate `['board', slug]` and `['feature', slug]`, sonner toast with Undo; errors toast `errorMessage`); `apps/web/src/features/hide/copy-link.ts` (`copyLink(url)`: clipboard write, toast `Link copied` / `Could not copy the link`).

### Wave 2 (parallel, deps: T005)

- [X] T006 [P] [US1] @implementation [ctx: apps/web/src/features/board/feature-list.tsx:100-200, specs/006-hide-branch/contracts/interfaces.md "Web UI"] Board row context menu in `feature-list.tsx`: `Copy link` (lucide `Link`) to `${location.origin}/p/${slug}/f/${dir}`, separator, label "Hide a branch (for all its features)", one `Hide <branch>` item (lucide `EyeOff`) per `entry.branches`; the row stays a working link/click target. Test in `apps/web/test/` (board list test file): menu opens on contextmenu, Copy link calls the clipboard, Hide posts to the route.
- [X] T007 [P] [US1] @implementation [ctx: apps/web/src/features/graphs/nodes.tsx:159-200, apps/web/src/features/board/board-page.tsx:303-330] Work map: `BranchNode` wraps its body in a `ContextMenu` with `Hide this branch` (EyeOff) when `data.onHide` is set; `workMapElements` passes `onHide` (from `useHideBranch`) for branch nodes; the feature page's versions graph passes none. Test in `apps/web/test/graphs.test.tsx`.
- [ ] T008 [P] [US1,US3] @implementation [ctx: apps/web/src/features/feature-detail/graph-panels.tsx:28-75, apps/web/src/features/feature-detail/feature-page.tsx:180-290, apps/server/src/services/board-query.ts (FeatureDetail, HiddenBranch)] Feature page: in the Versions panel's Branches list a `⋯` DropdownMenu button per branch (`Hide this branch`, EyeOff, aria-label "Branch actions for <name>"); a "Hidden branches" section from `detail.hidden` (`<branch> — hidden by @login, <age>`, "Show again" button, help line from contracts), shown also when `versions` is empty; the empty-state "No branch carries this feature." only when both are empty. Test in `apps/web/test/feature-detail.test.tsx`.

## Phase 6: Polish

### Wave 3 (parallel, deps: T004,T006,T007,T008)

- [ ] T009 [P] @implementation Docs: spec 001 contract pointer to `specs/006-hide-branch/contracts/interfaces.md` (web-api); a short "Hiding a leftover branch" paragraph in `README.md` or `docs/` where the board is described (check which exists).
- [ ] T010 [P] @routine Run `pnpm check`; re-run any failing test alone; report, fix nothing.

## Dependencies

T001 → T003 → T004, T005 → T006, T007, T008 → T009, T010. T002 is independent.
