---
description: "Tasks for 004 Teammates' pushed work on the board"
---

# Tasks: Teammates' pushed work on the board

**Input**: `specs/004-pushed-branch-sharing/` (spec.md, plan.md, research.md P1–P6, data-model.md,
contracts/interfaces.md, quickstart.md, preview.md)

**Tests**: included (constitution Art. 8).

**Rules for every task**: project CLAUDE.md (no speculative complexity without buy-in); the repo
stays generic; read `spec-hub-dev` for test commands and `reporter-testing` before touching the
reporter; server tests in parallel agents use their own `SPECHUB_TEST_DB`.

## Format: `[ID] [P?] [deps] [Story] @capability Description`

---

## Phase 2: Foundational

### Wave 1 (parallel)

- [X] T001 [P] @implementation Core settings and manifest: `projectSettings`/`projectFields` gain `sharePushedBranches: z.boolean()` (create defaults to false) in `packages/core/src/project.ts`; manifest `Branch` gains `remote: z.literal(true).optional()` in `packages/core/src/manifest.ts`. Tests in `packages/core/test/manifest.test.ts` (and a project schema test if one exists).
- [X] T002 [P] @implementation Core board: `FeatureVersion.remote: boolean`; `BranchRef.carrierUserId: string | null`; `buildBoard` drops remote versions whose branch name has a local version in the same folder and keeps one remote copy per name (newest `lastChangeAt`, ties by `carrierUserId`), mapping kept remote ones to `carrierUserId: null` (preview.md §3); `buildWorkMap` puts null-carrier branches under `person:remote` with owner `{ kind: 'unknown' }` and a label the web can show ("Shared remote"). Fix every core consumer of `carrierUserId`. Tests in `packages/core/test/board.test.ts` and `graphs.views.test.ts`.
- [X] T003 [P] @implementation DB: `project.sharePushedBranches` (`share_pushed_branches` boolean not null default false) and `cloneBranch.remote` (boolean not null default false) in `apps/server/src/db/schema.ts`; generate migration `0006_share_pushed_branches` with a one-line header comment.

## Phase 3: US1/US2/US3 — hub side

- [X] T004 [deps: T001,T002,T003] [US1,US2] @implementation Server: `GET /:slug/config` returns `sharePushedBranches`; project create and PATCH accept it (admin only, via the core schema); ingest stores `clone_branch.remote = b.remote === true`; `loadVersionRows` selects it into `FeatureVersion.remote`; `VersionSummary.carrierUserId` null for remote versions; MCP `formatBoard` marks remote-only branches ` (seen on the shared remote)` and `formatFeature` prints `Branch <name>: seen on the shared remote, last change <age>`. Tests: ingest (remote flag stored; old manifests unchanged), projects (PATCH toggles, non-admin 403), board (a remote copy is dropped when the author's local branch of the same name is reported; two clones' remote copies give one entry; owner is the spec's first committer, not the reporter), MCP wording.

## Phase 4: Reporter

- [X] T005 [P] [US3] @reasoning Reporter content keep check (FR-014, all reports): replace `KEEP_AWK`'s `git log --cherry-pick` with the content check of preview.md §1 — build `(path, blob)` pairs of every document version the default branch ever had once per report (`git log --raw --no-abbrev -z <base> -- specs/`), keep a folder that is also on main only when one of its documents (spec, plan, tasks, extras) on the branch is a pair not in the set. Remove the old check (no shim). E2E in `apps/server/test/reporter/reporter.e2e.test.ts`: a deploy branch built by a "take main's tree" commit from before a later main edit reports nothing; a kept squash-merged branch reports nothing; a branch editing a landed spec still reports it; existing rebase/cherry-pick landing tests stay green.
- [ ] T006 [deps: T004,T005] [US1,US2,US3] @reasoning Reporter remote pass (option on): read `sharePushedBranches` from `/config`; with it on, list `refs/remotes/<remote>/*` not merged into the default branch, committed in the last 14 days, excluding `HEAD`, names that are local branches, and private prefixes; report them after local branches (500 limit) as `"remote": true`, `pushed: true`, under their short name; cache the remote lines in `<state>/remote-cache` keyed by `git hash-object` of the remote list, default tip, extra names and private prefixes (preview.md §2). Option off: no remote pass, no cache file, manifest unchanged. E2E: option off → no `remote`; on → a teammate's pushed branch reported with `remote: true` and stored; a 20-day-old one not; a same-named local branch wins; a private prefix hides one; a second report without fetch reuses the cache (assert the cache file's key unchanged and lines reused); after a fetch that moves a remote branch the cache is rebuilt; output stays silent.

## Phase 5: Web

- [X] T007 [deps: T004] [US1] @implementation Web: a "Share pushed branches" switch in `apps/web/src/features/admin/settings-tab.tsx` (one line of help from contracts/interfaces.md), create dialog default false; null carriers: feature page branch picker/versions show "Seen on the shared remote" and people/carrier counts skip them; `graph-elements.ts` and `dependency-map/feature-details.tsx` handle null; work map shows the "Shared remote" node. Tests in `apps/web/test/admin.test.tsx`, `feature-detail.test.tsx`, `graphs.test.tsx` as fits.

## Phase 6: Polish

### Wave 4 (parallel, deps: T006,T007)

- [ ] T008 [P] @implementation Docs: spec 001 contract pointers to `specs/004-pushed-branch-sharing/contracts/interfaces.md` (reporter-http, extension "What a report contains", web-api); extension README (the option, the 14-day window, "carries a feature only with new document text"); `reporter-testing` skill (content check, remote pass, cache, how to build deploy-branch and squash-merge fixtures).
- [ ] T009 [P] @routine Run `pnpm check`, `shellcheck -s sh` and `dash -n` on the reporter; re-run any failing test alone; report, fix nothing.

## Dependencies

T001, T002, T003 → T004 → T006, T007 → T008, T009. T005 runs alongside T004 (reporter only) and precedes T006 (same file).
