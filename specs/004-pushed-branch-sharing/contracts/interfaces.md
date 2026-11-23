# Contracts: Teammates' pushed work on the board

Deltas to spec 001's contracts (and spec 005's). Everything not listed is unchanged.

## Reporter ↔ hub

- `GET /config` adds `"sharePushedBranches": true | false`.
- `POST /reports`: a branch entry may carry `"remote": true` (omitted otherwise). A remote branch is
  `pushed: true`, named by its short name (`refs/remotes/origin/152-file-storage` →
  `152-file-storage`).

## Reporter behaviour

- **All reports (FR-014)**: a feature folder that also exists on the default branch is reported for
  a branch only when one of its documents (spec, plan, tasks, configured extras) is a version the
  default branch never had, by `(path, blob id)` over `git log --raw <base> -- specs/`. Replaces the
  `--cherry-pick` check.
- **Option on (FR-004 – FR-008)**: also report `refs/remotes/<remote>/*` branches not contained in
  the default branch, with a commit in the last 14 days, whose short name is not a local branch and
  does not start with a private prefix; local branches first within the 500 limit. Remote lines are
  cached in `<git-common-dir>/spec-hub/remote-cache` keyed by the remote refs, default tip, private
  prefixes and extra document names.
- Option off: no remote branches, no cache file, report unchanged.

## Web API

- `GET /api/projects` / `PATCH /api/projects/:slug` (admin): `sharePushedBranches` boolean.
- Board and feature responses: `BranchRef.carrierUserId` and `VersionSummary.carrierUserId` may be
  `null` ("seen on the shared remote").

## UI

- Project settings: a "Share pushed branches" switch with one line of help: "Connected clones also
  report teammates' pushed branches from the last 14 days, so work shows before everyone connects."
- Feature page: a remote version is labelled "Seen on the shared remote" in the branch picker and
  versions panel, and is not counted as anyone's carried branch.
- Work map: a "Shared remote" node holds remote branches.

## MCP

- `board`: a feature whose only branches are remote shows its branch with ` (seen on the shared
  remote)`.
- `feature`: `Branch <name>: seen on the shared remote, last change <age>` instead of `carried by`.
