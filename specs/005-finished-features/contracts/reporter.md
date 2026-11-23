# Contract: reporter ↔ hub, changes for finished features

Deltas to [spec 001's reporter-http.md](../../001-team-board/contracts/reporter-http.md) and
[extension.md](../../001-team-board/contracts/extension.md). Everything not listed is unchanged.
All changes are additive: an older reporter keeps working and simply never sends `features`.

## `GET /config`

Adds `finishedTip`: the default-branch commit of the newest listing stored with `features`, or null.

```json
{ "defaultBranch": "main", "numbering": "sequential", "maxDocumentBytes": 524288, "login": "joexbayer",
  "finishedTip": "53cba2ab…" }
```

## `POST /reports`

`default` gains an optional `features` array (at most 2,000; `dir` unique):

```json
"default": {
  "branch": "main", "tip": "53cba2ab…", "tipAt": 1792990000,
  "dirs": ["001-foo", "002-bar"],
  "features": [
    {
      "dir": "001-foo",
      "addedAt": 1790000000,
      "lastChangeAt": 1791000000,
      "author": { "name": "Joe", "email": "joe@example.com" },
      "docs": { "spec": { "oid": "a1b2…", "size": 14211 }, "plan": null, "tasks": null }
    }
  ]
}
```

- `features` present: the complete list of folders under `specs/` on the default branch (the first 2,000
  in path order). Its documents count for the 409 `missing` answer and the
  too-large markers exactly like branch documents.
- `features` absent: the listing is not sent this time; the hub's finished features are unchanged.
- The hub applies `features` only when `branch` is the project's default branch and `tipAt` is newer
  than the stored `finished_tip_at`. It then upserts every listed folder and removes the project's
  finished features that are not listed. The `dirs` step is unchanged.
- Times are Unix seconds and are clamped to now by the reporter, as for branch features.

## The reporter (`spec-hub`)

In `build_manifest`, when the clone has the default branch (`$base`):

- Read `finishedTip` from the `GET /config` response already fetched.
- Leave `features` out when `finishedTip` equals `$base_tip`, or `$base_tip` is an ancestor of it.
- Otherwise build it from three git calls on `$base`, all limited to `specs/`:
  - `git ls-tree -r -t -z -l` — the folders and their documents' oids and sizes;
  - `git log --first-parent --diff-merges=first-parent -z --format=%x01%ct --name-only` —
    `addedAt` (oldest) and `lastChangeAt` (newest) per folder;
  - `git log -M -z --diff-filter=AR --format=%x01%ct%x1f%an%x1f%ae --name-status` — the owner, by
    `OWNER_AWK` as for branch features.
- No new output, no new command, no new git config. The foreground hook is untouched: all of this
  runs in the background report.

## Review follow-ups (2026-11-23)

- `GET /config` also returns `finishedTipAt` (Unix seconds or null). The reporter leaves `features`
  out when its `<remote>/<default>` commit time is not newer than `finishedTipAt` (the hub's own
  rule); no `git merge-base` call. A shallow clone never sends `features` (its history would
  misattribute owners and landing times).
- The hub deletes finished features missing from a listing only when the listing's `tipAt` is not
  older than the project's `default_tip_at`, so an older listing cannot remove a folder that a newer
  `dirs` step just recorded (mixed old and new reporters).

## Extra documents (FR-014–FR-016)

Repository config (`spec-hub-config.yml`, flat `key: value`):

```yaml
documents: preview.md
```

Space-separated file names, at most 5, each matching `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.md$` and
not `spec.md`, `plan.md` or `tasks.md`. Invalid names are ignored. Default: none.

Every feature entry (branch features and `default.features`) gains an optional `extra` array:

```json
"extra": [ { "name": "preview.md", "oid": "c3d4…", "size": 8123 } ]
```

At most 5 entries, names unique and matching the pattern above. The documents count for the 409
`missing` answer and the too-large markers like the others. Omitted when empty.
