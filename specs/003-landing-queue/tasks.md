---
description: "Tasks for 003 Landing lock (revised 2026-10-30)"
---

# Tasks: Landing lock

**Input**: `specs/003-landing-queue/` (spec.md, plan.md, research.md L1, L2, L10, L12, L14–L19,
data-model.md, contracts/mcp-tool.md, contracts/http-api.md, preview.md)

**Tests**: included (constitution Art. 8: unit tests for core, Postgres-backed tests for persistence).

**Rules for every task**:

- Follow the project CLAUDE.md: no speculative complexity without the user's buy-in. No caps, no
  priorities, no configurable timeouts, no land detection.
- The repo stays generic: no project, team or host names.
- Read the `spec-hub-dev` skill for test commands. Server tests drop and recreate their database:
  a parallel agent sets its own `SPECHUB_TEST_DB` and drops it afterwards.

## Format: `[ID] [P?] [deps] [Story] @capability [ctx] Description`

---

## Built under the first draft (2026-10-29)

- [X] T001–T009, T027: core `advance`/`estimateMinutes`, `land_place` with migration 0004, the
  queue service (`withQueue`, `settle`, `endPlace`, `statusFor`, `poll`, `endOwn`), reporter routes
  `/:slug/land` and `/:slug/land/end`, the `spec-hub land` command with a background check-in, and
  their tests. The verify gate (2026-10-30) found one blocker and three warnings in the check-in;
  they were fixed, then the revision removed that code path (T032).
- T010–T026, T028 of the first draft are superseded by the tasks below.

---

## Phase 3: The lock over MCP (US1, US2, US3) — MVP

**Goal**: agents take, wait for and open the lock over MCP; a forgotten lock expires.

**Independent test**: two MCP clients: A `land_lock` → holds; B `land_lock` waits; A `land_unlock`
→ B's waiting call returns "You hold the landing lock" within 5 s.

### Wave 1 (parallel)

- [X] T029 [P] [US3] @implementation [ctx: packages/core/src/landing.ts:1-39, packages/core/test/landing.test.ts] In `packages/core/src/landing.ts`: replace `CHECKIN_MS` with `WAIT_MS = 300_000` and add `HOLD_MS = 60 * 60_000`; a holder that picked up expires after `HOLD_MS` without a call, a waiter after `WAIT_MS` (preview.md §1). Update the `pickedUp` comment to `checked_in_at >= started_at`. Update `packages/core/test/landing.test.ts`: holder alive at 59 min, expired at 61; waiter expired at 301 s; skip unchanged.
- [X] T030 [P] @implementation [ctx: apps/server/src/db/schema.ts:170-215, apps/server/src/db/migrations/0004_landing_queue.sql, specs/003-landing-queue/data-model.md] In `apps/server/src/db/schema.ts`, `landPlace`: drop `cloneId`, `baseTip`, `staleBy`; replace the unique index `land_place_live_clone` with `land_place_live_member` on `(project_id, user_id) WHERE state <> 'ended'`. Delete `0004_landing_queue.sql` and `meta/0004_snapshot.json`, remove the 0004 entry from `meta/_journal.json`, and regenerate with drizzle-kit under the same name (it was never applied outside test databases). Keep the header comment line of the SQL file.

### Wave 2 (sequential)

- [X] T031 [deps: T029,T030] [US1,US2,US3] @reasoning [ctx: apps/server/src/services/landing.ts, specs/003-landing-queue/preview.md, specs/003-landing-queue/contracts/mcp-tool.md] Rework `apps/server/src/services/landing.ts` to the member model:
  - `LandCaller` becomes `{ project: { id, defaultBranch }, userId }`; drop `ownClone`, the `foreign-clone` result, `ifCheckedInAt` and `Status.checkedInAt`.
  - `settle`: the grant sets `state = 'holding', started_at = now` only (not `checked_in_at`); `pickedUp = checkedInAt >= startedAt`.
  - `poll(db, c, join)`: check in (update the member's live place), insert when `join` and none, then `settle` again, then `statusFor` (by user). The check-in comes before the grant, so a grant inside the member's own call counts as picked up.
  - `ask(db, c)`: preview.md §2 — poll every 2 s until holding or 25 s; deadline injectable for tests.
  - `unlock(db, c, landed)`: what `endOwn` did, by member.
  - `statusFor`: notice only for `expired` (no stale).
- [X] T032 [deps: T031] @implementation [ctx: packages/extension/scripts/spec-hub:905-1035, apps/server/src/routes/reporter.ts:1-110, .claude/skills/reporter-testing/SKILL.md:56-90] Remove the shell path: in `packages/extension/scripts/spec-hub` delete `safe`, `land_not_used`, `land_field`, `land_num`, `land_post`, `land_leave`, `land_checkin_loop`, `cmd_land`, the `land` dispatcher entry and usage lines; keep `shellcheck -s sh` and `dash -n` clean. In `apps/server/src/routes/reporter.ts` delete the two land routes and `LandBody`, and inline `refuseForeignClone` back into the reports route as at HEAD (one caller). Delete `apps/server/test/reporter/land.e2e.test.ts`. In `.claude/skills/reporter-testing/SKILL.md` delete the "Testing `land`" section and move its general lessons (prove a test can fail by reverting the fix; fake only `Date`) to `.claude/skills/spec-hub-dev/SKILL.md`.
- [X] T033 [deps: T031] [US1,US2] @implementation [ctx: apps/server/src/mcp/handler.ts:1-90, apps/server/src/mcp/format.ts:1-40, specs/003-landing-queue/contracts/mcp-tool.md] In `apps/server/src/mcp/handler.ts` add `land_lock` (no input, calls `ask`) and `land_unlock` (`{ landed: z.boolean() }`, calls `unlock`) with the descriptions and output lines of contracts/mcp-tool.md; build the lines in `apps/server/src/mcp/format.ts` with `oneLine()`. Pass `defaultBranch` in the MCP caller. Replace the "Read-only tools only" comment: the lock tools change queue state only; nothing here approves or objects (Art. 4.1). SEC-A05: every login goes through `oneLine()`.
- [X] T034 [deps: T032,T033] [US1,US2,US3] @implementation [ctx: apps/server/test/landing.test.ts, apps/server/test/mcp.test.ts:1-123] Rewrite `apps/server/test/landing.test.ts` against the service (no HTTP routes): grant at once; second member waits with position and estimate; repeated ask keeps one place; unlock hands over; leave; 5 concurrent asks give one holder; skip after 120 s; holder expires after 60 min and the next call carries the expired notice; waiter dropped after 300 s; a member removed from the project loses the place. In `apps/server/test/mcp.test.ts`: the tool list is now `board, feature, land_lock, land_unlock`; a waiting `land_lock` returns "You hold" within 5 s of another member's `land_unlock`; a non-member's token gets 404 as before. Fake only `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`).

**Checkpoint**: `pnpm check` passes; agents can take turns.

---

## Phase 4: Visibility (US4)

### Wave 3 (parallel)

- [X] T035 [P] [deps: T034] [US4] @implementation [ctx: apps/server/src/services/landing.ts, apps/server/src/mcp/handler.ts, apps/server/src/mcp/format.ts:1-40, specs/003-landing-queue/contracts/mcp-tool.md] Add `loadQueueView(tx, project, userId)` (holder, waiting with positions and estimates, last 20 ended, minutes per turn) to `apps/server/src/services/landing.ts`; add the read-only MCP tool `landing` (`readOnlyHint: true`, no join) and `formatLanding` per contracts/mcp-tool.md; test in `apps/server/test/mcp.test.ts`.
- [X] T036 [P] [deps: T034] [US4] @implementation [ctx: apps/server/src/routes/board.ts:1-40, apps/server/src/app.ts:100-140, apps/server/src/services/audit.ts:1-30, specs/003-landing-queue/contracts/http-api.md] Create `apps/server/src/routes/landing.ts`: `GET /api/projects/:slug/landing` (the view) and `POST /api/projects/:slug/landing/:id/end` (`endById` in the service: any member; own place → released/left, someone else's → removed with `ended_by`; then settle), mounted in `app.ts` behind `requireSession` + `requireProjectRole()`. SEC-A01: the id is looked up within the URL's project (another project's id or an ended place → 404). SEC-A09: ending someone else's place writes a `land_removed` security event `{ placeId, owner }`. Tests in `apps/server/test/landing-routes.test.ts`: view, own end, someone else's end with event, 404 across projects, non-member refused as on other session routes.

### Wave 4 (sequential)

- [X] T037 [deps: T036] [US4] @implementation [ctx: apps/web/src/routes/_app.p.$slug.index.tsx, apps/web/src/features/board/board-page.tsx:1-60, specs/003-landing-queue/contracts/http-api.md] Add `apps/web/src/features/landing/landing-page.tsx` and `landing-query.ts` (query + end mutation), route `apps/web/src/routes/_app.p.$slug.landing.tsx`, and a "Landing" link in the project navigation: holder card with "Open lock", waiting list with "Remove", history table (outcome, ended by). The admin kit is a visual reference only (skill `admin-kit-reference`). Test in `apps/web/test/landing.test.tsx`.

---

## Phase 5: Polish

- [X] T038 [P] [deps: T035,T037] @implementation [ctx: README.md, specs/003-landing-queue/contracts/mcp-tool.md] Add a short "Landing lock" section to the README's MCP part: the three tools, the 25 s ask, the 60 min timeout, opening from the dashboard. Generic wording.
- [X] T039 [deps: T038] @routine Run `pnpm check` and walk quickstart.md scenarios 1–7 (scenario 5 by test).

## Dependencies

T029, T030 → T031 → T032, T033 → T034 → T035, T036 → T037 → T038 → T039.
