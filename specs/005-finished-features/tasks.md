---
description: "Tasks for 005 Finished features on the hub"
---

# Tasks: Finished features on the hub

**Input**: `specs/005-finished-features/` (spec.md, plan.md, research.md F1–F10, data-model.md,
contracts/reporter.md, contracts/web.md, contracts/mcp.md, quickstart.md, preview.md)

**Tests**: included (constitution Art. 8: unit tests for core, Postgres-backed tests for persistence,
reporter end-to-end tests against a real hub and real git).

**Rules for every task**:

- Follow the project CLAUDE.md: no speculative complexity without the user's buy-in. No batching of
  uploads, no server-side search, no jobs, no sorting of the 2,000 cap (research F5, F7, F9).
- The wire change is additive: a manifest without `default.features` must keep working exactly as
  today (research F1).
- The repo stays generic: no project, team or host names in code or tests.
- Read the `spec-hub-dev` skill for test commands and the `reporter-testing` skill before touching
  the reporter. Server tests drop and recreate their database: a parallel agent sets its own
  `SPECHUB_TEST_DB` and drops it afterwards.

## Format: `[ID] [P?] [deps] [Story] @capability [ctx] Description`

---

## Phase 2: Foundational (blocks every story)

### Wave 1 (parallel)

- [X] T001 [P] @implementation [ctx: packages/core/src/manifest.ts:1-124, specs/005-finished-features/data-model.md, specs/005-finished-features/contracts/reporter.md] In `packages/core/src/manifest.ts`: add `DefaultFeature` (`dir`, `addedAt`, `lastChangeAt`, `author`, `docs`, strict) and an optional `features: z.array(DefaultFeature).max(2000)` on `DefaultBranch`. In `superRefine`: duplicate `features[].dir` is an issue; every default-feature document oid is checked against `objectFormat` like branch documents. Add `export function* manifestDocs(m)` yielding every non-null `DocRef` of branch features and default features; rewrite `uploadableOids` on it. Export `ManifestDefaultFeature`. SEC-V5 (input validation): bounds as in data-model.md. Tests in `packages/core/test/manifest.test.ts`: a manifest without `features` still parses; with features parses; duplicate dir, 2,001 entries, wrong-length oid and a future `addedAt` are rejected; `uploadableOids` includes default documents and skips oversized ones.
- [X] T002 [P] @implementation [ctx: packages/core/src/types.ts:1-86, packages/core/src/owner.ts:1-29, packages/core/src/board.ts:15-30, specs/005-finished-features/data-model.md, specs/005-finished-features/preview.md] Create `packages/core/src/finished.ts` with `finishedFeature`, `buildFinished`, `matchFinished` and `ownerKey` exactly as preview.md §3 (`ownerKey`: member → lowercase `githubLogin`, handle → lowercase handle, git-name → lowercase name, unknown → ''). Add `FinishedRow` and `FinishedFeature` to `packages/core/src/types.ts` (data-model.md) and export the module from `packages/core/src/index.ts`. Tests in `packages/core/test/finished.test.ts`: landedAt is `firstSeenAt` for non-baseline and `addedAt` for baseline; owner header wins over author; title falls back to the folder name; tasks null when total is 0; `reported` false without `addedAt`; order newest first, unknown last, ties by dir; `matchFinished` puts an exact number first, matches title and dir case-insensitively, filters by owner key.
- [X] T003 [P] @implementation [ctx: apps/server/src/db/schema.ts:26-40, apps/server/src/db/schema.ts:136-148, apps/server/src/db/migrations/0004_landing_queue.sql:1-5, specs/005-finished-features/data-model.md] In `apps/server/src/db/schema.ts`: add to `landedFeature` the nullable columns `addedAt`, `lastChangeAt` (timestamptz), `authorName`, `authorEmail`, `specOid`, `planOid`, `tasksOid` (text), `specSize`, `planSize`, `tasksSize` (integer); add to `project` `finishedTip` (text) and `finishedTipAt` (timestamptz), both nullable. Generate migration `0005_finished_features` with drizzle-kit (`pnpm --filter @spec-hub/server exec drizzle-kit generate --name finished_features`) and give the SQL file a one-line header comment like 0004's.

---

## Phase 3: User Story 1 — Read a finished feature (P1) 🎯 MVP

**Goal**: a connected clone sends the default branch's features; a member opens any finished feature
and reads its spec, plan and tasks as on the default branch.

**Independent test**: quickstart.md automated scenario 1, then open the feature page of a finished-only
feature and of a feature that is both in flight and finished with `?branch=main`.

### Wave 2 (parallel, deps: T001,T002,T003)

- [X] T004 [P] [deps: T001,T003] [US1] @implementation [ctx: apps/server/src/services/ingest.ts:1-60, apps/server/src/services/ingest.ts:108-125, apps/server/src/services/ingest.ts:195-211, apps/server/src/routes/reporter.ts:19-28, apps/server/src/routes/projects.ts:55-65, specs/005-finished-features/preview.md] In `apps/server/src/services/ingest.ts`: make `storeTooLargeMarkers` iterate `manifestDocs`; extract `isBaseline(p, tipAt)` from `advanceDefaultBranch`; add `storeFinished` as preview.md §2 and call it after `advanceDefaultBranch` inside the same transaction (SEC-FC fail closed: any error rolls the whole report back). In `apps/server/src/routes/reporter.ts` `/config` add `finishedTip` (project's `finished_tip` or null). In `apps/server/src/routes/projects.ts` reset `finishedTip`/`finishedTipAt` with `defaultTip` when the default branch changes. Tests in `apps/server/test/ingest.test.ts`: a listing's missing documents come back as 409, then it is stored with facts; `firstSeenAt`/`baseline` keep their first value on a later listing; an older or equal `tipAt` listing changes nothing; a listing for another branch name changes nothing; a newer listing without a dir deletes it; an empty `features` array deletes all; a manifest without `features` leaves finished rows untouched; `/config` returns `finishedTip`; changing the default branch resets it.
- [X] T005 [P] [deps: T001] [US1] @reasoning [ctx: packages/extension/scripts/spec-hub:194-320, packages/extension/scripts/spec-hub:421-476, packages/extension/scripts/spec-hub:170-183, apps/server/test/reporter/harness.ts:46-200, apps/server/test/reporter/reporter.e2e.test.ts:1-60, specs/005-finished-features/preview.md, specs/005-finished-features/contracts/reporter.md] In `packages/extension/scripts/spec-hub`: add `default_features` and `DEFAULT_AWK` (preview.md §1); move `meta`, `dirpart`, `docref`, `docjs`, `authorjs` and `clamp` into one shared awk snippet used by `FEATURES_AWK`, `BRANCHES_AWK` and `DEFAULT_AWK` instead of copying them; call `default_features` in `build_manifest` and put `$FEATURES` inside the `default` object after `dirs`. A git failure leaves `FEATURES` empty (fail open). Keep `shellcheck -s sh` and `dash -n` clean. Tests in `apps/server/test/reporter/reporter.e2e.test.ts` (quickstart.md 1, 2, 6): `main` with three features — full docs, spec only, one brought in by a merge commit — after one report the hub has all three finished with documents, author and `addedAt` equal to the merge commit's time for the merged one; a following commit on a feature branch sends a manifest without `features` (check with `report --print-manifest`) and uploads nothing; the commit prints nothing and the hook stays within its time budget.

### Wave 3 (sequential)

- [X] T006 [deps: T002,T004] [US1] @implementation [ctx: apps/server/src/services/board-query.ts:20-60, apps/server/src/services/board-query.ts:150-295, apps/server/src/routes/board.ts:1-47, specs/005-finished-features/contracts/web.md, specs/005-finished-features/preview.md] In `apps/server/src/services/board-query.ts`: add `loadFinished(db, projectId)` returning `{ defaultBranch, finished, members }` (landed rows joined with their documents' facts via the existing `docColumns`/`factsOf` pattern, then `buildFinished` with the in-flight and stale dirs from `loadBoard`); in `loadFeature` extract the document-loading block into `shownDocs` and add the default-branch version as preview.md §4; `landed` gains `branch` and `finished` (data-model.md). In `apps/server/src/routes/board.ts` add `GET /projects/:slug/finished` behind the same `guard` (SEC-A01: session and membership). Tests in `apps/server/test/board.test.ts`: the finished list (order, owner, landedAt, inFlight, reported); 401 signed out, 403 non-member, 404 unknown project; `features/:dir` of a finished-only feature shows main's documents; of a feature both in flight and finished shows the branch by default and main with `?branch=main`.
- [X] T007 [deps: T006] [US1] @implementation [ctx: apps/web/src/features/feature-detail/feature-page.tsx:119-300, apps/web/test/feature-detail.test.tsx:1-60, specs/005-finished-features/contracts/web.md] In `apps/web/src/features/feature-detail/feature-page.tsx`: the branch picker lists `versions` plus `landed.branch` when `landed.finished.reported` (a picker appears as soon as there are two choices); a finished-only feature's header shows the Landed badge, its owner (`landed.finished.owner`) and "landed <relative time>"; tasks progress for the default-branch version comes from `landed.finished.tasks`; a landed feature whose documents were never reported shows "Documents not reported yet; they appear after a connected clone that has fetched <branch> reports." instead of empty tabs. Documents render through the existing sanitized `Document` component (SEC-V5 untrusted content, unchanged). Tests in `apps/web/test/feature-detail.test.tsx`: picker offers main and switches; finished-only header; not-reported state.
- [X] T008 [P] [deps: T006] [US1] @implementation [ctx: apps/web/src/features/board/side-rail.tsx:100-135, apps/web/src/features/board/board-page.tsx:183-245, apps/web/test/board.test.tsx:1-40] Board links (FR-012): in `apps/web/src/features/board/side-rail.tsx` each "Recently landed" row becomes a `Link` to `/p/$slug/f/$dir`; in `apps/web/src/features/board/board-page.tsx` `PipelineView`'s `onOpen` also opens landed cards (their node id is `landed:<dir>`; use the node's `data.landed.dir`). Test in `apps/web/test/board.test.tsx`: a recently landed row links to its feature page.

**Checkpoint**: finished features are readable in the hub; the board is unchanged except for links.

---

## Phase 4: User Story 2 — Find finished work (P1)

**Goal**: a searchable, owner-filterable finished list whose filters live in the URL.

**Independent test**: with 150 finished features, find one by title word, by number, and list one
owner's features; reload the URL and get the same list.

- [X] T009 [deps: T006] [US2] @implementation [ctx: apps/web/src/routes/_app.p.$slug.index.tsx:1-18, apps/web/src/routes/_app.p.$slug.map.tsx:1-11, apps/web/src/features/board/board-page.tsx:55-80, apps/web/src/features/board/board-query.ts:1-40, specs/005-finished-features/contracts/web.md] Create `apps/web/src/routes/_app.p.$slug.finished.tsx` (`validateSearch`: `q` and `owner`, strings, optional) and `apps/web/src/features/finished/finished-page.tsx`: query `GET /api/projects/:slug/finished` (key `['finished', slug]`, same 403/404 handling as the board via `isFinal`), a search input and an owner select bound to the URL (`replace: true`), rows from `matchFinished` (core) showing number, title, owner chip, "landed <relative>", tasks `done/total`, and an "In flight again" badge; each row links to `/p/$slug/f/$dir` with `search: { branch: defaultBranch }`. Empty states per contracts/web.md. Add a "Finished" button next to the dependency map link in `apps/web/src/features/board/board-page.tsx`. Regenerate the route tree. Tests in `apps/web/test/finished.test.tsx`: renders rows newest first; typing filters and a number match comes first; owner filter; empty states; row link carries `branch`.

**Checkpoint**: US1 and US2 deliver the feature for people.

---

## Phase 5: User Story 3 — Agents can read finished work (P2)

**Goal**: agents list finished features and read any version of a feature.

**Independent test**: over MCP, `finished` with a query returns one line per match; `feature` with
`branch: "main"` and `document: "spec"` returns main's spec text.

- [X] T010 [deps: T006] [US3] @implementation [ctx: apps/server/src/mcp/handler.ts:56-110, apps/server/src/mcp/format.ts:1-150, apps/server/test/mcp.test.ts:1-60, specs/005-finished-features/contracts/mcp.md] In `apps/server/src/mcp/handler.ts` add the read-only `finished` tool (`query`: string ≤ 255, `owner`: string ≤ 39, both optional; SEC-V5 bounded input) calling `loadFinished` and `matchFinished`; add the optional `branch` argument (≤ 255) to `feature`, passed to `loadFeature`; change its not-found text to `no feature <id> in flight or finished`. In `apps/server/src/mcp/format.ts` add `formatFinished` (contracts/mcp.md: header with count, aligned lines, at most 200 then `… and N more`, both empty answers; every title, login and name through `oneLine()` — SEC-V5); `formatFeature` shows owner, `Landed <age>`, tasks and `Also in flight on <branch>` for finished features; `formatDocument` takes the default-branch version's last change from `landed.finished.lastChangeAt`. Tests in `apps/server/test/mcp.test.ts` (tool list now includes `finished`; query and owner filters; `feature` with `branch`) and `apps/server/test/mcp-format.test.ts` (200-line cap, empty answers, control characters stripped).

---

## Phase 6: User Story 4 — The list stays true to the default branch (P2)

**Goal**: edits, renames, removals and lagging clones are reflected correctly.

**Independent test**: quickstart.md automated scenarios 3, 4 and 5.

- [X] T011 [deps: T004,T005] [US4] @implementation [ctx: apps/server/test/reporter/reporter.e2e.test.ts:1-60, apps/server/test/reporter/harness.ts:46-200, specs/005-finished-features/quickstart.md] End-to-end tests in `apps/server/test/reporter/reporter.e2e.test.ts`: (3) edit a landed spec, rename one folder and delete another on the remote's `main`, fetch, commit: the hub shows the edited spec, the new folder name only, and not the deleted one; (5) a second clone whose `origin/main` is behind the hub's `finishedTip` sends no `features`, and one that lacks that commit sends them and the hub ignores them as older; (4) a manifest without `features` posted by hand leaves the finished rows unchanged. Each test must fail when its rule is reverted (reporter-testing skill).

---

## Phase 7: Polish & cross-cutting

### Wave 4 (parallel, deps: T005,T009,T010,T011)

- [X] T012 [P] @implementation [ctx: specs/001-team-board/contracts/reporter-http.md:20-80, specs/001-team-board/contracts/extension.md:85-100, packages/extension/README.md:1-40, .claude/skills/reporter-testing/SKILL.md:1-40, specs/005-finished-features/contracts/reporter.md] Docs: in `specs/001-team-board/contracts/reporter-http.md` and `extension.md` add one line each pointing to `specs/005-finished-features/contracts/reporter.md` for `default.features` and `finishedTip`; in `specs/001-team-board/contracts/mcp-tools.md` and `web-api.md` point to 005's `mcp.md` and `web.md`. In `packages/extension/README.md` say in two sentences that reports include the default branch's specs when it has moved, and that one updated member is enough. In `.claude/skills/reporter-testing/SKILL.md` add a short "Default-branch listing" section: the skip rule, how to see it with `report --print-manifest`, and the first-parent merge-time gotcha.
- [X] T013 [P] @routine [ctx: package.json:1-30] Run `pnpm check` (biome, tsc, all tests), `shellcheck -s sh packages/extension/scripts/spec-hub` and `dash -n packages/extension/scripts/spec-hub`; report failures with output, fix nothing.

---

---

## Phase 8: Review follow-ups (verify 2026-11-23: PASS-WITH-WARNINGS)

Contracts: the "Review follow-ups" sections of contracts/reporter.md, web.md and mcp.md.

### Wave 5 (parallel)

- [ ] T014 [P] @implementation Server and core fixes: `buildFinished` drops rows that were reported (`addedAt` set) with no spec, plan or tasks, keeping the `landed_feature` row (W1); `loadFinished` returns `finishedTipAt` (ms or null) and no `members` (W2, necessity); `GET /board` also returns `defaultBranch` (W4); `formatFeature` describes the finished version when `detail.shown.branch === landed.branch` and adds `Also in flight on <branches>` (W3); `storeFinished` skips the delete when the listing's `tipAt` is older than the pre-update `default_tip_at` (W5); MCP `finished` with an unmatched owner answers `No finished feature by <owner>`. Tests: a non-feature folder is not listed; `finishedTipAt` returned; `feature {branch: main}` describes the finished version; the mixed-fleet delete case; an oversized default-branch document is stored as too large and surfaces as `tooLarge`.
- [ ] T015 [P] @implementation Reporter fixes: `GET /config` returns `finishedTipAt` (Unix seconds or null); `default_features` skips when the local default-branch commit time is not newer than `finishedTipAt` (drop the `merge-base` check) and when `git rev-parse --is-shallow-repository` is true (W6, W7). E2E: a second commit on a feature branch after a stored listing uploads no blob and sends no `features`; a clone that lacks the hub's tip commit but is not newer sends no `features`; a shallow clone sends no `features`.
- [ ] T017 [P] @implementation Core: manifest feature entries (branch and default) gain optional `extra: [{ name, oid, size }]` (≤ 5, unique names, name pattern from contracts/reporter.md, oid format checked); `manifestDocs` yields them; remove the unused `ManifestDefaultFeature` export. Tests in `packages/core/test/manifest.test.ts`.

### Wave 6 (parallel, deps: T014,T015,T017)

- [ ] T016 [P] [deps: T014] @implementation Web fixes: finished page header "as of <relative>" from `finishedTipAt`, response type without `members` (W2); recently landed rows and landed pipeline cards link with `?branch=<defaultBranch>` from the board response (W4); feature page: unknown landing time shows as unknown (W9), the landed time also in a finished-only header, number from `landed.finished.number`, no duplicate picker entry when a branch is named like the default branch; finished page: an `?owner=` not in the list shows as the selected value. Tests for each.
- [ ] T018 [P] [deps: T017] @implementation Server extra documents: `extra_docs` jsonb (`[{name, oid, size}]`, default `[]`) on `clone_feature` and `landed_feature`, folded into migration `0005_finished_features` (regenerated; never applied outside test databases); ingest stores them for branch features and default features; `ShownVersion.extra` for the shown version (branch or default branch) via `shownDocs`. Tests in ingest and board tests.

### Wave 7 (parallel, deps: T016,T018)

- [ ] T019 [P] [deps: T018] @reasoning Reporter extra documents: read `documents` from the repo config (space-separated, ≤ 5, pattern, not spec/plan/tasks; invalid names ignored), report each listed file's blob in branch features (FEATURES_AWK) and default features (DEFAULT_AWK) as `extra`; add a commented `# documents: preview.md` line to `packages/extension/config-template.yml`. E2E: with `documents: preview.md`, a branch feature and a default feature report their preview, and it is uploaded and stored; without the key the manifest is unchanged.
- [ ] T020 [P] [deps: T018] @implementation Web and MCP extra documents: the feature page shows a tab per `shown.extra` document after spec, plan and tasks (`?tab=<name without .md>`, route validation accepts those names), rendered by the existing sanitized document component; MCP `feature` `document` accepts `spec|plan|tasks` or an extra name with or without `.md` (≤ 64 chars). Tests (web tabs; MCP returns preview text).

### Wave 8 (parallel, deps: T019,T020)

- [ ] T021 [P] @implementation Docs: extension README (the `documents` key, one paragraph), spec 001 extension contract pointer, `reporter-testing` skill (shallow clones skip the listing; the skip rule is by time).
- [ ] T022 [P] @routine Run `pnpm check`, `shellcheck -s sh` and `dash -n` on the reporter; report, fix nothing.

## Dependencies

- T001, T002, T003 first (Wave 1, parallel).
- US1: T004 (T001, T003) and T005 (T001) in parallel; then T006 (T002, T004); then T007 and T008.
- US2: T009 after T006. US3: T010 after T006. US4: T011 after T004 and T005.
- Polish after all stories.

```text
T001 ─┬─ T004 ─┬─ T006 ─┬─ T007
T003 ─┘        │        ├─ T008
T002 ──────────┘        ├─ T009 (US2)
T001 ── T005 ───────────┼─ T010 (US3)
          └── T011 (US4, + T004)
                         └─ T012, T013
```

## Parallel examples

- Wave 1: T001, T002, T003 touch different packages.
- Wave 2: T004 (server) and T005 (reporter) share only the manifest schema from T001.
- After T006: T007/T008 (web), T009 (web, new files plus one board button), T010 (server MCP) can
  run side by side; T008 and T009 both edit `board-page.tsx` in different places — run them in
  sequence if a merge is awkward.

## Implementation strategy

MVP is Phase 3 (US1): finished features reach the hub and are readable from the feature page and
"Recently landed". US2 makes them findable, US3 gives agents the same, US4 hardens the default-branch
rules with end-to-end tests. Each phase ends with `pnpm check` green.
