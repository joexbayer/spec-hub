# Research: Landing queue

> **Revised 2026-10-30** (spec Clarifications, revision session): the lock is held over MCP, not by
> a shell command. L14–L19 below replace L3–L9 and L11; L1, L2, L10 and L12 still apply, with
> "clone" read as "member". L13's accepted risks about check-ins no longer apply (there are none).

No NEEDS CLARIFICATION items remained after reading the spec, the constitution and the 001 code
(`apps/server/src/routes/reporter.ts`, `auth/bearer.ts`, `db/schema.ts`, `mcp/handler.ts`,
`packages/extension/scripts/spec-hub`). Each entry records a decision.

## L1 — No background job: the queue advances when someone asks

- **Decision**: every queue request, from the wait command, a check-in or the dashboard, first
  runs `advance` in one transaction under `pg_advisory_xact_lock(hashtext('land:' || project_id))`.
  `advance` expires silent places, skips a granted turn nobody picked up, and grants the turn to
  the next live place. It is a pure function in core, and the server applies its result.
- **Rationale**: whenever someone is waiting, their wait command asks every 15 s, so the queue
  moves within 15 s of a turn ending (SC-002) without pg-boss. With nobody waiting, nothing needs
  to move.
- **Alternatives**: a pg-boss sweep every 30 s (a job, scheduling and tests for no gain); LISTEN and
  NOTIFY long-polling (a held connection per waiter, and latency that SC-002 doesn't ask for).

## L2 — One table for places and history

- **Decision**: `land_place` holds both the live queue (`state` waiting or holding) and the history
  (`state` ended, with `outcome`).
  - A partial unique index allows one live place per clone (FR-003).
  - A second one allows one holder per project (FR-002).
- **Rationale**: a turn record is a place that ended. Two tables would copy rows on every turn.

## L3 — Who can join: the reporter's token

- **Decision**: the land routes sit with the reporter routes, behind `requireToken('report')` and
  `requireMember()`. The place belongs to the clone in the request, which must be a `clone` row of
  the same person and project. Otherwise the request gets 403 and a `land_refused` security event,
  as `clone_rejected` does today.
- **Rationale**: a connected clone already has this token, so there is no new permission, no
  migration of keys and no setup step. A token without `report` (read-only) can still use the
  read-only MCP tool (FR-004).
- **Alternatives**: 002's `coordinate` permission (adds a key migration and a dependency on 002 for
  no benefit here).

## L4 — Detecting the land and a stale result: the holder's check-ins

- **Decision**: after the turn starts, a background check-in runs on the holder's machine every
  60 s.
  1. It reads the remote tip of the default branch with `git ls-remote <remote> refs/heads/<default>`.
  2. When the tip differs from the turn's base tip (read when the turn started), it downloads the
     new commits with `git fetch --no-write-fetch-head <remote> <tip>`. This downloads objects only
     and moves no ref, so the clone is left as it was.
  3. It sends the author emails of `base..tip`, up to 50, with the check-in.

  The hub then decides:
  - **Landed**: any author email equals the clone's `commit_email`, case-insensitively. This holds
    for rebase, squash and merge commits, because the author survives all three.
  - **Stale**: there are new commits and none of them is the holder's. The hub records who made
    them, as logins of members whose clones report that email. An email that matches no member is
    shown as "someone not on the hub", and the email itself is never shown.
- **Rationale**: it works with every host and merge style, and does not wait for some other clone
  to happen to report (001's reports run only on local git events). The hub stays out of the
  repository (Art. 1.2).
- **Alternatives**:
  - 001's `default.tip` reports (no authors, and too late);
  - matching commit ids (breaks with squash and rebase-on-merge);
  - the hub querying the git host (host-specific, against Art. 2.5).
- **Known limit**: a land made with a commit email other than the configured one isn't recognised.
  The turn then ends as "released" when the land script exits (L5), and the land itself is
  unaffected.

## L5 — Ending the turn when the land script exits

- **Decision**: when the turn is granted, `land wait` records the process id of its caller, the land
  script's shell. The background check-in loop runs `kill -0 <caller>` each round. Once the caller
  is gone, the loop does one last check-in: "done" if the land was seen, "release" otherwise.
- **Rationale**: a failed gate ends the script, so releasing on exit covers FR-011 without the
  script doing anything (FR-017). If the developer's machine sleeps or loses the network, check-ins
  stop and the turn expires on the hub (FR-012).
- **Interactive use**: someone who types `spec-hub land wait` by hand has their interactive shell as
  the caller. The turn lasts until they land (seen by the check-ins), run `spec-hub land release`,
  or close the shell. If they forget, an admin can end it from the dashboard. A maximum turn length
  would add a setting the spec explicitly doesn't want.

## L6 — Waiting: short polls, every 15 s

- **Decision**:
  - `land wait` posts `land` every 15 s. Each post is the place's check-in.
  - A line is printed only when the position or holder changes, with no in-place terminal
    rewriting.
  - Ctrl-C (INT, TERM or HUP) posts `land/end`, which counts as leaving, then exits 130.
- **Two reporter routes, not four**: `land` (join, poll, check in) and `land/end` (done, release,
  leave). Joining and checking in differ only in which fields are present.
- **Timeouts** (spec defaults, constants in core):
  - pick-up 120 s;
  - check-in 300 s;
  - 15 s polls while waiting, 60 s check-ins while holding.

## L7 — Failing open

- **Decision**: in each of these cases, `land wait` prints one line to stderr and exits 0, so
  `spec-hub land wait && gate && push` goes on as if the queue did not exist (FR-022, Art. 3.6):
  - not configured, or not connected (no clone id, no token);
  - the hub is unreachable (curl fails, or 15 s pass);
  - a 401, 403 or 404 response;
  - a 5xx response.

  The background check-in never prints except for the two notices: "turn expired" and "stale".
  It exits quietly when the hub can't be reached.
- **Exit codes**: 0 for "go ahead" (your turn, or the queue was not used); 130 when interrupted;
  2 on usage errors, as in every other command.

## L8 — Git authentication in the background

- **Decision**: the check-in runs git with `GIT_TERMINAL_PROMPT=0` and stdin from `/dev/null`. When
  neither `GIT_SSH_COMMAND` nor `core.sshCommand` is set, it also sets
  `GIT_SSH_COMMAND='ssh -o BatchMode=yes'`.
- **Rationale**: a background process must never ask for a password in the middle of the gate's
  output. If the remote can't be read without asking, there are no land or stale notices, and the
  turn still ends when the script exits.

## L9 — MCP: one read-only tool

- **Decision**: a tool `landing` with no input. It returns:
  - the holder and since when;
  - the waiting order with estimates;
  - the caller's own places;
  - any notice for the caller's last ended turn in the past hour (expired, or stale and who
    landed).
- **Rationale**: an MCP call can't keep a turn alive while the agent's shell runs the gate, so
  turns are held by the land command (spec Clarifications 2026-10-29). Seeing the queue is what an
  agent needs.

## L10 — Estimates

- **Decision**: `estimateMinutes(ahead, holding, durations)`:
  - per turn: the median of the last 10 turns that ended "landed", or 20 minutes when fewer than 3
    exist;
  - total: `(ahead + (holding ? 0.5 : 0)) × per turn`, rounded up to whole minutes.
- It is pure, lives in core and is unit-tested.

## L11 — Dashboard actions

- **Decision**: one session route `POST /api/projects/:slug/landing/:id/end`.
  - A project admin may end any live place, giving outcome `removed` with `ended_by`.
  - A member may end only their own, giving outcome `left` for a waiting place and `released` for
    one holding the turn.
  - Anything else gets 403 and `land_refused` in the security log (FR-025).
- **Rationale**: one route covers FR-013 and FR-014. The id is looked up within the URL's project,
  so another project's id returns 404.

## L12 — Removed members and renamed default branches

- **Decision**:
  - `advance` loads live places joined to `membership`, so the places of someone removed from the
    project end as `removed`, with `ended_by` null.
  - The default branch is the project's `default_branch`, which the wait command gets from the
    existing `GET /config`. It is never stored on the place.

## L13 — Accepted risks (security review, 2026-10-29)

- **Faked check-ins are accepted.** A member can send made-up commit authors. The worst result is
  marking their own turn as landed, or showing themselves a false stale notice. They can't touch
  anyone else's place, because the clone must be theirs. This is the same trust 001 places in
  members' reports.
- **No caps per member.** Nothing limits how many places a person holds, or how long a turn lasts.
  An admin can end any place from the dashboard (FR-013). Add caps only if untrusted members become
  a real case.
- **Admin ends are recorded on the place** (`ended_by`), not in the security log. Refused attempts
  are in the security log (`land_refused`).

## L14 — The lock is held over MCP (replaces L3, L5, L9)

- **Decision**: three MCP tools — `land_lock`, `land_unlock`, `landing` (contracts/mcp-tool.md).
  A place belongs to a member, not a clone: one live place per `(project_id, user_id)`.
- **Rationale**: the user wants agents to take and open the lock themselves. Agents already talk to
  the hub over MCP; the shell command, its background check-in and the two reporter routes go away.
- **Cost accepted**: nothing on the developer's machine keeps the lock alive or opens it when a
  process exits, so a forgotten lock stays until the 60-minute timeout or a dashboard open (L16).

## L15 — "Notified" is a blocking ask (replaces L6)

- **Decision**: `land_lock` waits up to 25 s, re-checking every 2 s inside the call (each check is
  one short `withQueue` transaction), and answers. The agent calls again until it holds the lock.
- **Rationale**: MCP servers can send notifications, but coding agents (Claude Code and others) do
  not hand them to the model mid-task; a tool result is what the model sees. 25 s stays under the
  30 s default response timeout of kamal-proxy and common reverse proxies.
- **Alternatives**: MCP resource subscriptions or log notifications (not surfaced to the model);
  LISTEN/NOTIFY for an instant wake-up (a held connection per waiter; 2 s polling meets SC-002).

## L16 — Timeouts (replaces the check-in rule of L5)

- **Decision**: core constants `PICKUP_MS = 120 s`, `WAIT_MS = 300 s`, `HOLD_MS = 60 min`.
  - A waiter not heard from for 120 s is passed over; for 300 s, dropped (`expired`).
  - A granted place not picked up within 120 s is `skipped`.
  - A holder not heard from for 60 min is `expired`. Any call renews.
- **Picked up**: `checked_in_at >= started_at`. The grant no longer sets `checked_in_at`, so a grant
  made inside the member's own call counts as picked up (that call is told it holds the lock).

## L17 — Permission: any member's MCP token (replaces L3)

- **Decision**: the tools use the MCP route's existing `requireToken('read')` + `requireMember()`.
- **Rationale**: the lock is advisory and changes nothing in a repository; requiring the `report`
  permission would make every agent's MCP token a reporter token. *(Default, pending review.)*

## L18 — Dashboard: any member can open the lock (replaces L11)

- **Decision**: `POST /api/projects/:slug/landing/:id/end`, any member, any live place of the
  project. Someone else's place ends as `removed` with `ended_by`, plus a `land_removed` security
  event; one's own as `released`/`left`.

## L19 — Cut: land detection and the stale warning (replaces L4, L7, L8)

- **Decision**: not in this feature. Without a process on the developer's machine during the turn,
  the hub has no view of the remote while the lock is held. 001's reports of the default branch
  tip could feed it later; that is a separate feature if teams ask for it.
