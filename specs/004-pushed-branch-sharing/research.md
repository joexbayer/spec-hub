# Research: Teammates' pushed work on the board

Measured on the pilot (ai-gateway) on 2026-11-23: 7,935 commits on `origin/main`, 304 unmerged
remote branches, of which 25 have a commit in the last 14 days (plus the 9 already local in the
test clone).

## P1. "Carries a feature" is decided by document content (FR-014)

**Decision**: replace the reporter's commit-based landed check (`KEEP_AWK`: `git log --cherry-pick
--right-only`) with a content check. Once per report, and only when some branch has a feature folder
that also exists on the default branch, read every document version the default branch ever had:
`git log --format= --raw --no-abbrev <base> -- specs/` gives `path` and blob id for every change.
A folder that exists on the default branch is kept for a branch only when one of its documents
(spec, plan, tasks or a configured extra) on the branch is a `(path, blob)` pair not in that set.

**Rationale**: the pilot's deploy branches are built with commits like "take X's tree at …" and
features land by squash merge, so no branch commit is patch-identical to a commit on main and the
old check calls them unlanded. Measured: of 24 folders `chore/production` appears to carry, all 24
hold versions main already had; of 35 on `chore/staging`, only 070 and 106 hold text main never had
(Henrik's guardrail work, copied in). The same check removes squash-merged leftovers. Keying by path
avoids a fresh template stub matching another feature's identical stub.

**Cost**: one `git log --raw` (0.4–0.7 s on the pilot) per report that has such folders, replacing
one `git log --cherry-pick` per such branch.

**Alternatives considered**: a project ignore list (hides the bug; rejected in clarification);
tree-level comparison (tree ids of folders are not in `--raw` output and differ for unrelated files).

## P2. Which remote branches (FR-004, FR-008)

**Decision**: with the option on, candidates are `refs/remotes/<remote>/*` (the remote spec 001
already reads), minus `HEAD`, minus those contained in the default branch (`--no-merged`), minus
those with no commit in the last 14 days, minus names that are local branches of the clone, minus
private prefixes. They are reported under their short name (`152-file-storage`), flagged
`"remote": true`, `pushed: true`. Local branches come first in the 500-branch limit.

**Rationale**: the short name lets the hub match a teammate's own later report of the same branch
(FR-011). Measured: all 304 take 72 s; the 34 recent ones take 12 s.

## P3. Cache the remote part between fetches

**Decision**: the remote branches' manifest lines depend only on the remote refs, the default
branch tip, the private prefixes and the configured extra documents — none of which change between
fetches. The reporter keeps one cache file in the clone's state dir: a key (a `git hash-object` of
those inputs) and the computed lines. Same key: reuse the lines; else recompute and rewrite.

**Rationale**: without it, every commit's background report spends ~12 s on the pilot re-checking
teammates' branches that have not changed. With it, that work happens once per fetch.

**Alternatives considered**: per-branch cache entries (more files and cleanup for no extra benefit,
since a moved main invalidates them all anyway).

## P4. Option storage and delivery (FR-001, FR-003)

**Decision**: `project.share_pushed_branches boolean not null default false`, edited in the hub's
project settings next to the default branch and numbering (core `projectSettings` gains it, so the
API and form share one schema). `GET /config` returns `sharePushedBranches`; the reporter reads it on
each report, so a change applies from every clone's next report.

## P5. Remote copies on the hub (FR-009 – FR-012)

**Decision**: `clone_branch.remote boolean not null default false`. In core, `FeatureVersion` gains
`remote`; `buildBoard` drops a remote version when any local version of the same branch name and
folder exists, and keeps one remote copy per (folder, branch name) — the newest, ties by clone id.
`BranchRef.carrierUserId` becomes `string | null`, null meaning "seen on the shared remote": such a
branch is never attributed to the reporting person (work map, feature page people, MCP "carried by").
Owner resolution is unchanged (FR-015 of spec 001).

**Rationale**: the hub already groups versions per folder; dedupe by name fits there. A nullable
carrier makes every consumer decide explicitly instead of silently showing the reporter.

## P6. Byte-identical reports with the option off (FR-002, SC-002)

**Decision**: the remote branch pass runs only when `/config` says `sharePushedBranches: true`;
`remote` is omitted for local branches. FR-014 does change reports for branches that only held
versions main already had (that is the fix), so SC-002 is checked on repositories without such
branches.
