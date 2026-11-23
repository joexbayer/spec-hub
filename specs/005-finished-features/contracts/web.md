# Contract: web API and UI, finished features

## `GET /api/projects/:slug/finished` (new)

Session, member of `:slug` (as the board). 200:

```json
{
  "defaultBranch": "main",
  "finished": [
    {
      "dir": "150-operator-passkeys", "number": "150", "title": "Operators sign in with a passkey",
      "owner": { "kind": "member", "userId": "…", "githubLogin": "aaaknowit", "name": "…", "image": null },
      "landedAt": 1793000000000, "lastChangeAt": 1793100000000,
      "tasks": { "done": 71, "total": 73 },
      "reported": true, "inFlight": true
    }
  ],
  "members": [ { "userId": "…", "githubLogin": "aaaknowit", "name": "…", "image": null } ]
}
```

Times in milliseconds. Order: newest `landedAt` first, unknown last. 401 / 403 / 404 as the board.

## `GET /api/projects/:slug/features/:dir` (changed)

- `?branch=<defaultBranch>` shows the default branch's documents when the hub has them.
- A feature with no branch versions shows the default branch's documents.
- `landed` gains `branch` (the default branch name) and `finished` (a `FinishedFeature`).

## UI

- **Finished page** `/p/$slug/finished?q=&owner=`: reached from the board header, next to the
  dependency map. A search box (title, folder name, number; a number match comes first) and an owner
  select. One row per feature: number, title, owner, "landed 3d ago", tasks `71/73`, and an
  "In flight again" badge when `inFlight`. A row opens `/p/$slug/f/<dir>?branch=<defaultBranch>`.
  Empty states: no listing yet ("Fills once a connected clone that has fetched `main` reports"), and
  no match ("No finished feature matches").
- **Feature page**: the branch picker includes the default branch when the hub has its documents.
  For a feature only finished, the header shows the Landed badge, the owner and "landed <when>".
  A row whose documents were never reported says so instead of showing empty tabs.
- **Board**: unchanged entries and groups. "Recently landed" rows (side rail) and landed cards
  (pipeline, double-click) open the feature page on the default branch.
