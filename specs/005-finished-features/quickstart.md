# Quickstart: validate finished features

Prerequisites: the local hub and test database from the `spec-hub-dev` skill.

## Automated

```sh
pnpm --filter @spec-hub/core exec vitest run          # manifest schema, buildFinished
pnpm --filter @spec-hub/server exec vitest run        # ingest, routes, MCP, reporter e2e
pnpm --filter @spec-hub/web exec vitest run           # finished page, feature page picker
```

The reporter end-to-end tests (`apps/server/test/reporter/`) cover, against a real hub and real git:

1. **First listing** — a repo whose `main` has three features (one with spec, plan and tasks, one
   with only a spec, one merged by a merge commit) and a connected clone: after one report the hub
   has all three as finished, with documents, owners and `addedAt` equal to the merge commit's time
   for the merged one (F3).
2. **Unchanged main** — a second commit on a feature branch sends a manifest without `features`,
   and no blob is uploaded (SC-003).
3. **Main moves** — edit a landed spec, rename one folder and delete another on `main`, fetch,
   commit: the edited spec shows, the renamed folder shows under its new name only, the deleted one
   is gone (US4).
4. **Older reporter** — a manifest without `features` is accepted and changes no finished feature
   (compatibility, F1).
5. **Lagging clone** — a second clone whose `origin/main` is behind the hub's `finishedTip` sends no
   `features`; one that lacks that commit sends them and the hub ignores them as older (FR-005).
6. **Silence** — all of the above print nothing and the hook stays within its budget (Art. 3.6).

## By hand on a copy of the pilot

1. Start the hub locally, create project `ai-gateway`, connect a clone of the pilot repository
   (`sh .specify/extensions/spec-hub/scripts/spec-hub connect`) using the reporter from this branch.
2. Open `/p/ai-gateway/finished`: 136 rows (SC-001), newest landing first. Spot-check five features'
   documents against `git show origin/main:specs/<dir>/spec.md`.
3. Type `passkey`, then `150`, then pick an owner; copy the URL into another tab (FR-008, SC-002).
4. Open 157 (in flight again): the page opens on its branch; the picker offers `main`; the finished
   list shows "In flight again" (FR-010).
5. Ask an agent: "list our finished features about tenants" and "show the spec of feature 079"
   (SC-005).
6. Compare the board before and after: same entries and counts (SC-006).
