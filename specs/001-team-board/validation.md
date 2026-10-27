# Validation: Team Board (T055)

**Date**: 2026-10-26 (13:48–14:03 CET)
**Branch**: `001-team-board` at `0a89533`, working tree clean apart from build output.

## Environment

| | |
|---|---|
| Machine | Apple M3 Pro, 36 GiB, macOS 26.5.1 (25F80) |
| Node | v22.20.0 (runs `src/index.ts` directly with type stripping) |
| Postgres | 18.6 (Homebrew), database `spechub_validation` |
| git | 2.50.1 (Apple Git-155) |
| curl / sh | system `/usr/bin/curl`, `/bin/sh` |
| specify CLI | 1.1.0 |
| hyperfine | `/opt/homebrew/bin/hyperfine` |

**Hub**: `node src/index.ts` from `apps/server` on port 3000 (`PUBLIC_URL=http://localhost:3000`),
serving the production web build (`pnpm --filter @spec-hub/web build`) and the extension zip built
the way the Dockerfile builds it. The run used neither `docker compose` (T055's wording) nor the
Vite dev server. Docker is checked separately in T057.

**Machine load**: the machine was shared with another agent's test suite and a Docker smoke test.
Load averages ranged from 59 (start) to about 12 (end) on 12 cores. An idle `git rev-parse HEAD` took
**11–13 ms** here, against `/usr/bin/true` at 1.6 ms. Every timing that spawns processes is
therefore inflated by an unknown factor. The numbers below are what was measured, not idle-machine
numbers.

**Sign-in**: no GitHub OAuth App is available, so there was no real GitHub sign-in. Users, signed
session cookies and tokens were created the way `apps/server/test/helpers.ts` creates them
(`internalAdapter.createSession` + `makeSignature`, `auth.api.createApiKey`). Everything after
sign-in ran against the real hub over HTTP with the real reporter script (`sh
.specify/extensions/spec-hub/scripts/spec-hub`), with real git repositories (one bare origin plus one
clone per developer, each with its own `HOME`/`XDG_CONFIG_HOME`) and hooks installed by `connect`.

Scripts and raw outputs are in the T055 scratch directory (`seed.ts`, `build.ts`, `verify.ts`,
`sc002.ts`, `sc003.ts`, `sc005.ts`, `scale.ts`, `quickstart.ts`, `catchup.ts`, hyperfine JSON).

## Seeded demo board (checked through the API)

Project `demo` (sequential numbering) with @joexbayer (hub admin, project admin), @alice and
@bob. `001-provider-port` and `002-bundle-loader` were pushed to main before anyone
connected. `003-usage-events` was merged and pushed after connecting.

`verify.ts` (33 checks, **all PASS**) read `GET /api/projects/demo/board` and
`/features/<dir>` with the members' session cookies and ran `buildDependencyGraph` on the board:

| Feature | Phase | Owner | Branch(es) | Flags |
|---|---|---|---|---|
| 004-ledger-settlement | Implement 7/19 | @joexbayer | 004-ledger-settlement (pushed) | depends on landed 003, so not blocked |
| 005-quota-alerts | Plan | @alice | 005-quota-alerts (pushed), 007-usage-export (not pushed) | blocked by 004 |
| 006-lease-renewal | Clarify (1) | @bob | 006-lease-renewal (pushed), 008-blåbær-rapport (not pushed) | collides with 006-tenant-dashboards |
| 006-tenant-dashboards | Specify | @joexbayer | joe/tenant-dashboards (pushed) | collides with 006-lease-renewal; blocked by unknown 099-not-here |
| 007-usage-export | Tasks (0/12) | @alice | 007-usage-export (not pushed) | blocked by 005 |
| 008-blåbær-rapport | Specify | @bob | 008-blåbær-rapport (not pushed) | non-ASCII name; detail page 200 |

- Critical path: `004-ledger-settlement → 005-quota-alerts → 007-usage-export`.
- Dependency edges are exactly the four `**Depends on**` links (003→004, 004→005, 005→007,
  099→006-tenant-dashboards). `099-not-here` is an unknown node and `003-usage-events` is a landed
  node.
- Recently landed: `003-usage-events` only. `landedDirs` = 001, 002, 003. 001 and 002 count as
  baseline history.
- Stacked branches (007 cut from 005, 008 cut from 006) list both branches on the parent feature,
  because the child branch also differs from `origin/main` in the parent's dir.
- A request without a session gets 401. Another member can open 004 and receives the spec, plan and
  tasks content.

## quickstart.md "End-to-end validation"

Run by `quickstart.ts` in a separate project, `quickstart`, so that `demo` stays as seeded.

| # | Scenario | Result | Evidence / why |
|---|---|---|---|
| 1 | Set up a project (US5) | **PASS, with a doc defect** | Hub admin `POST /api/projects` returns 201, and a non-admin gets 403. Inviting `bob` returns 201. The extension installed from the hub. **However, the documented command `specify extension add --from <hub>/extension/spec-hub.zip` fails on specify 1.1.0 with `Missing argument 'extension'`.** What works is `specify extension add spec-hub --from http://localhost:3000/extension/spec-hub.zip`, which asks one `[y/N]` "Untrusted Source" confirmation. See Failures, F1. |
| 2 | Connect (US4, SC-003) | **PASS** (sign-in part NOT RUN) | Token created through `POST /api/tokens` as the second account. `connect` with the token on stdin printed exactly `Connected to quickstart as @bob: 0 features in flight.` in 473 ms. |
| 3 | Work shows up by itself (US1) | **PASS** | Commit of `specs/001-x/spec.md` on an unpushed branch: stderr empty. The board showed 001-x in Specify, not pushed, **172 ms** after the commit returned. A `tasks.md` with 2 of 5 ticked showed Implement 2/5. After `private add scratch/`, a commit on `scratch/y` adding `specs/002-y` never appeared, even after an explicit report. |
| 4 | See everyone (US2) | **PASS (API)**; rendering NOT RUN here | The admin opened 001-x, and the API returns the raw spec containing the ```` ```mermaid ```` block and a literal `<script>`. Whether the mermaid block renders as a diagram and the `<script>` shows as text is UI behavior, left for the orchestrator's screenshots. `001-other` on another branch from the first account: both entries carry the collision flag. |
| 5 | Agent (US3, SC-005) | **PARTIAL** | The `claude mcp add …` step and the Claude Code question were not run, because this session does not drive another interactive agent or change Claude config. The repo's `.claude/settings.json` allows `mcp__spec-hub__*`. The MCP `board` tool was called with the official client and a token (see SC-005). |
| 6 | Removal (US5) | **FAIL (1 of 6 checks)** | Removing @bob returns 204, and their entries leave the board. Their next `report` prints `you are not a member of project quickstart on the hub`, and their token gets 403 on `/api/r/quickstart/config`. The project security log shows `project_created`, `member_invited`, `clone_connected` and `member_removed`. **It does not show the token creation**, so FR-031 is not met. See Failures, F2. |

## Success criteria

| SC | Target | Measured | Verdict |
|---|---|---|---|
| SC-001 | Pilot spot checks | Not measurable here (two-week pilot) | NOT RUN |
| SC-002 | Committed change on open boards in ≤ 30 s | Time from `git commit` returning to the change in `GET /board` (100 ms poll, 004 tasks ticked 8…12, read with another member's cookie), 5 runs: 725, 450, 563, 440, 616 ms. **Median 563 ms.** The web board polls every 10 s (plan), so a browser sees it within about 10.6 s. | PASS (API latency; the browser poll interval is by design) |
| SC-003 | First sign-in to work on the board in < 2 min | GitHub sign-in can't be measured (no OAuth App). `connect` from start to the "Connected to demo as @…" line on fresh clones: **593, 311, 312 ms (median 312 ms)**. The first connects while building the demo (load ≈ 59) took 2097, 1457 and 2249 ms. Connecting the 124-branch clone with 40 features (first report plus blob uploads) took 8205 ms. | PASS for the measurable part |
| SC-004 | Git commands ≤ 100 ms slower; an outage never fails or prints | hyperfine, `git commit -q --allow-empty -m x`, `--warmup 3 --runs 20`, connected clone vs plain clone. Run 1: median **84.4 vs 21.8 ms (+62.6 ms)**, mean 99.6 vs 22.7 (+76.9), max 316.8 ms with hooks. Run 2: median **112.2 vs 35.7 ms (+76.5 ms)**, mean 121.1 vs 37.0 (+84.1). `spec-hub hook post-commit` alone: median **31.3 ms** (run 2: 29.2). Outage: see FR-005 below. | PASS on median and mean overhead. Individual runs exceeded +100 ms under load (max 316.8 ms). |
| SC-005 | Agent answers in one request, one screen, ≤ 30 in flight | Project `scale`, 30 in flight. One MCP `board` call (official `@modelcontextprotocol/client`, bearer token) took 25 ms and returned **31 lines** (≤ 40). Widest line 147 characters, so it wraps on an 80- or 120-column terminal. Only tools `board` and `feature` are exposed. | PASS (lines). The width is a note, not a target. |
| SC-006 | Pilot developers stay connected | Pilot only | NOT RUN |
| SC-007 | Every pair sharing a number is flagged before landing | demo: both `006-*` flagged, no other flags. quickstart: both `001-*` flagged. | PASS |
| SC-008 | Map edges = Depends on links | demo: the edge set equals the four header links, including an unknown dir. | PASS (in the seeded scenario; the pilot check is not run) |

First 10 lines of the SC-005 `board` output (scale project, synthetic owners; `carol` is not a
member, so the entry shows the handle):

```
scale — 30 in flight
109 Feature 109 v2  @alice      Implement 2/20  3m ago  review/109-feature-109, feat/109-feature-109 (not pushed)
103 Feature 103 v2  @carol        Tasks (0/15)    3m ago  review/103-feature-103, feat/103-feature-103 (not pushed)
104 Feature 104 v2  @joexbayer      Implement 6/20  3m ago  review/104-feature-104, feat/104-feature-104
105 Feature 105 v2  @alice      Specify         3m ago  review/105-feature-105, feat/105-feature-105 (not pushed)  ⛔ blocked by 104-feature-104
106 Feature 106 v2  @bob  Clarify (1)     3m ago  review/106-feature-106, feat/106-feature-106
107 Feature 107 v2  @carol        Plan            3m ago  review/107-feature-107, feat/107-feature-107 (not pushed)
108 Feature 108 v2  @joexbayer      Tasks (0/13)    3m ago  review/108-feature-108, feat/108-feature-108  ⛔ blocked by 107-feature-107
100 Feature 100 v2  @joexbayer      Specify         3m ago  review/100-feature-100, feat/100-feature-100
101 Feature 101 v2  @alice      Clarify (1)     3m ago  review/101-feature-101, feat/101-feature-101 (not pushed)
```

## Plan performance goal: report at scale

Synthetic clone with **124 local branches**: 40 carry a feature change across 30 distinct dirs
(10 dirs on two branches), and the other 83 plus `main` are merged into `origin/main`. Foreground
`spec-hub report` (not quiet), hyperfine `--warmup 1 --runs 5`:

- Run 1: median **7261 ms** (6562–9553). `report --print-manifest` (no network) median 6912 ms, so
  the hub round trip is not the cost.
- Run 2: median **9176 ms** (8327–9544).
- Target: **< 3 s**. Verdict: **FAIL** (F3).

One report spawns **451 git processes** (counted with `GIT_TRACE`): 205 `rev-parse`, 81 `log`,
80 `cat-file`, 40 `merge-base`, 40 `diff`, plus `tr`/`sed`/`awk`/`tail` per feature. At the
11–13 ms per git process measured on this loaded machine, the git calls alone take about 5–6 s.
The report runs detached from the hook, so it does not slow git (SC-004 above). It does delay the
board: at the pilot's size, SC-002's latency would be about the report time (≈ 7–9 s here), still
under 30 s.

## FR-005 / Art. 3.6: hub outage

1. Stopped the hub (`kill <pid>`, and `/healthz` stopped answering).
2. In bob's connected clone: two commits on `008-blåbær-rapport` and two `git checkout`s
   all exited 0 with **0 bytes on stderr**. Stdout was git's own summary only. `spec-hub status`
   afterwards: `Last error: none`, and no `error` file in the state dir, so there is no next-day
   notice for an outage.
3. Restarted the hub with the same command (`start-hub.sh`).
4. The board still showed 008 in Specify. The next commit (adding a plan) exited 0 with empty
   stderr, and the board showed 008 in **Plan 571 ms** after that commit returned.
5. Restored 008 to its seeded tip and re-ran `verify.ts`: all PASS.

Verdict: **PASS**.

Side note: the first restart attempt died silently because my test shell had exported the sandbox
`HOME`, which breaks the asdf `node` shim. That came from the test setup, not from the hub.

## Failures and what they mean

- **F1 (doc/UI defect, blocks a copy-paste install):** every place that shows the install command
  omits the extension name: `apps/server/src/routes/me.ts:42` (connect page `installCommand`),
  `apps/web/src/features/admin/settings-tab.tsx:105`, `README.md:45`, `packages/extension/README.md:8`
  and `specs/001-team-board/quickstart.md:49,76`, with `apps/server/test/me.test.ts:23` asserting
  it. On specify 1.1.0 the command fails. The fix is to insert `spec-hub` before `--from`. It also
  asks one `[y/N]` untrusted-source prompt. That prompt comes from the specify CLI, so it is not one
  of the hub's prompts, but onboarding should mention it. Not fixed here: it spans seven files
  including a server test that this task may not run.
- **F2 (spec divergence, FR-031):** `sign_in`, `token_created` and `token_revoked` are recorded with
  `project_id = NULL` (tokens are hub-scoped). `GET /api/projects/:slug/security-events` filters on
  `project_id`, and no other endpoint lists security events. These events are written but are
  **visible to no one**, against FR-031 ("visible to the project's administrators") and quickstart
  step 6. A fix needs a decision: either show a project's admins the hub-scoped events of the
  project's members, or add a hub-admin log. Not fixed here.
- **F3 (plan performance goal missed):** the 124-branch report takes 7.3–9.2 s against the < 3 s
  target, because it spawns about 450 git processes. Part of this is machine load, but the count is
  inherent to one process per field. Batching would cut most of them: one `git ls-tree -r -l` per
  branch for oids and sizes instead of `rev-parse` + `cat-file -s` per document, and one `git log`
  per branch instead of two per dir. This is a reporter refactor, not a small fix. It does not break
  SC-002 or SC-004 at the measured sizes.
- **Not measured:** real GitHub sign-in (SC-003's first part), the pilot criteria (SC-001, SC-006,
  SC-008 in the pilot), the in-browser rendering checks (mermaid, `<script>` as text), the
  `claude mcp add` agent conversation, and `docker compose up` (T057 covers the image).
