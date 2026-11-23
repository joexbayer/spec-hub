# Quickstart: validate teammates' pushed work

## Automated

```sh
pnpm --filter @spec-hub/core exec vitest run      # buildBoard dedupe, work map, settings schema
pnpm --filter @spec-hub/server exec vitest run    # config, ingest of remote, routes, MCP, reporter e2e
pnpm --filter @spec-hub/web exec vitest run       # settings switch, remote labels
```

Reporter end-to-end scenarios (real hub, real git):

1. **Deploy branch** — `main` has feature 001; a branch built by copying main's tree from before the
   last edit of 001's spec (a "take main's tree" commit, not a merge): it reports no features.
2. **Squash merge** — a feature branch squash-merged into main and kept: reports nothing.
3. **Real work** — a branch that edits a landed spec: still reports it (changes a landed feature).
4. **Option off** — a teammate's pushed branch in `origin/*`: not reported; manifest has no `remote`.
5. **Option on** — the same branch is reported with `remote: true`, owner = its spec's first
   committer; a 20-day-old remote branch is not; a remote branch with a local branch of the same
   name is reported once, as the local one; a private prefix hides a remote branch.
6. **Cache** — a second commit without fetching reuses the cache (no `git diff` per remote branch);
   after a fetch that moves a remote branch, the cache is rebuilt.
7. **Silence** — all of the above print nothing; the hook stays within budget.

## By hand on the pilot

1. Connect a clone with this branch's reporter. Before turning the option on: `chore/production`
   carries nothing, 150 is not in flight (SC-006).
2. Turn on "Share pushed branches" in project settings; commit once; the board shows Anders's and
   Henrik's active branches under their names, marked as seen on the shared remote (SC-001, SC-003).
3. Turn it off; next report: those entries leave (US2).
