# Research: Finished features on the hub

Measurements are from the pilot (ai-gateway) on 2026-11-23, git 2.50, a clone with 7,935 commits on
`origin/main`: 136 folders under `specs/`, 406 of them `spec.md`/`plan.md`/`tasks.md`, 9.1 MiB in
all, none over 512 KiB.

## F1. The default branch's documents travel in the existing report, additively

**Decision**: `default` in the report manifest gains an optional `features` array: per folder on the
default branch, its documents (oid and size, as for branch features), its owner's commit identity,
when it landed and when it last changed. `dirs` stays as it is. Documents go through the existing
409 → `PUT /blobs/:oid` → retry flow, so the hub stores each document once per project, whichever
branch or clone it came from.

**Rationale**: Every connected clone's hooks run a copy of the reporter that is refreshed only by
`connect` (extension contract, "clone-managed hooks"). A breaking change to the manifest would make
the hub refuse every member's reports until each of them reconnects, an Art. 3 failure. An optional
field keeps every old reporter working unchanged, and because the default branch is shared, one
member who updates fills the whole list for the project.

**Alternatives considered**: a separate `POST /finished` endpoint (a second request per report, a
second validation and auth path, and the same document flow anyway); replacing `dirs` with
`features` (breaks every installed reporter, see above).

## F2. Send the listing only when the default branch moved

**Decision**: `GET /config` returns `finishedTip`, the default-branch commit of the newest listing the
hub stored with `features`. The reporter leaves `features` out when its own default-branch tip equals
`finishedTip` or is an ancestor of it (`git merge-base --is-ancestor`, which fails, and so sends the
listing, when the clone lacks that commit).

**Rationale**: SC-003. The listing is ~55 KB for the pilot; sending it on every commit would multiply
each report's size by ten or more. With the rule, a report grows only on the first report after
the default branch moves, which is also the only time the hub can learn anything new.

**Alternatives considered**: always sending it (fails SC-003); a digest of the listing (needs the
listing computed every time, which is the cost we want to skip).

## F3. When a feature landed, and when it last changed: first-parent history

**Decision**: one `git log --first-parent --diff-merges=first-parent --name-only` over the default
branch, limited to `specs/`. For each folder the newest commit that touched it is `lastChangeAt`,
the oldest is `addedAt`. With first-parent history a merge commit is credited with the files it
brought in, so `addedAt` is when the folder reached the default branch, whatever the merge style
(checked on the pilot: merge `65fff659db` lists `specs/001-provider-port-streaming/plan.md`).

The hub shows a finished feature's landing time as `firstSeenAt` (when the hub first saw it on the
default branch) for features that landed after the project was connected, and `addedAt` for the
history that was already there (FR-007).

**Cost**: 0.39 s on the pilot. Requires `--diff-merges`, which is in git 2.31, the reporter's minimum.

**Alternatives considered**: the author time of the commit that added the folder (on a merged branch
that is when the work started, not when it landed); `firstSeenAt` for everything (every historical
feature would show the day the project connected).

## F4. Owner: the existing owner rule over the default branch's history

**Decision**: reuse `OWNER_AWK` (the author of the oldest commit that added `spec.md`, following
renames) over `git log -M --diff-filter=AR` of the default branch, which the reporter already runs
for branch features whose spec came from the default branch. The hub resolves the owner with
`resolveOwner` exactly as for in-flight features (FR-015 of spec 001).

**Cost**: 0.72 s on the pilot, only when the listing is sent (F2).

## F5. The first upload goes through the existing flow, unbatched

**Decision**: no change to the upload loop. The first report after the update finds ~406 documents
missing, uploads them one `curl` each in the background report, and posts again. Later reports
upload only what changed.

**Rationale**: the report runs detached, under the clone's lock, with no output; a minute or two
once per project is invisible to the developer. A connection that drops mid-way loses nothing:
uploaded documents stay stored, and the next report uploads the rest (SC-004: within 5 reports).

**Cost noted**: until that first upload completes, the hub keeps that clone's previous report (the
409 rule stores nothing while documents are missing), so the clone's in-flight changes appear one
report later than usual. Only the first report after updating is affected.

**Alternatives considered**: one `curl` with connection reuse or `--parallel` (faster, but needs
temp files per blob and a curl config; Art. 7.4 without a demonstrated problem); accepting reports
with missing default-branch documents (a second, partial storage path).

## F6. Storage: the landed-feature row carries the snapshot

**Decision**: `landed_feature` (one row per folder on the default branch, already) gains the
listing's facts: `added_at`, `last_change_at`, author name and email, and the three documents' oids
and sizes. A listing is applied only when its default-branch tip time is newer than the project's
`finished_tip_at` (FR-005). Applying it upserts every listed folder and deletes the project's rows
for folders the listing no longer has (FR-011: removed or renamed). The `dirs` step (landing
detection) is unchanged.

**Rationale**: the row already is "a feature on the default branch"; a second table would duplicate
its key and lifecycle.

**Alternatives considered**: storing the listing per clone like branch reports (the default branch
is shared; per-clone copies would need a merge rule to show one).

## F7. Limits

**Decision**: `features` holds at most 2,000 entries (each ~350 bytes; 2,000 fit the 1 MiB manifest
limit with room for branches). A default branch with more folders sends the first 2,000 in path order
(no sorting in the reporter's awk for a case no team is near); `dirs` keeps its 5,000 limit.

**Rationale**: the pilot has 136 after a year; 2,000 is an order of magnitude of headroom.

## F8. The feature page shows the default branch as one more version

**Decision**: no separate page for a finished feature. The feature page's branch picker offers the
default branch when the hub has its documents; `?branch=<default>` shows them. A feature that is
only finished opens on the default branch. A feature both in flight and finished opens on its
in-flight branch, as today, and the picker reaches the default branch (FR-010's link both ways: the
finished list links with `?branch=<default>`, the page's picker goes back).

**Alternatives considered**: a separate finished-feature page (a second document view to keep in
step with the first).

## F9. The finished list filters in the browser

**Decision**: `GET /api/projects/:slug/finished` returns every finished feature (≤ 2,000 short
entries). Text and owner filters run in the browser and live in the URL (`?q=`, `?owner=`), so a
link reproduces the list (FR-008).

**Alternatives considered**: server-side search and paging (needless at this size).

## F10. Agents

**Decision**: a new read-only MCP tool `finished` (optional `query`, optional `owner` login): one
line per feature, newest landing first, at most 200 lines then "… and N more". The `feature` tool
finds every finished feature (it already resolves `landedDirs`) and gains an optional `branch`
argument, so an agent can read the default branch's text of a feature that is also in flight.
