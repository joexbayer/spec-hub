# Interfaces: Mark a spec as done

## Web API (session cookie, Origin-checked like every mutation)

### `POST /api/projects/:slug/features/:dir/done`

- Any project member; non-member 403, unknown project 404. `dir` validated as on
  `GET /features/:dir`.
- Inserts one `feature_done` row per distinct document version the project's member clones report
  for `dir`. None: `404 { "error": "no such feature in flight" }`.
- `200 { "dir": string, "versions": number }`.

### `DELETE /api/projects/:slug/features/:dir/done`

- Any project member. Deletes every mark of `dir` in the project. `204`, also when there was none.

### `GET /api/projects/:slug/features/:dir` (changed)

Adds `done: DoneMark | null` (data-model.md); `versions` no longer contains marked copies. 200, not
404, when the folder's only copies are marked.

### Removed

`POST`/`DELETE /api/projects/:slug/hidden-branches` and `FeatureDetail.hidden` (first build, never
merged).

## MCP

- `board`: marked copies are not counted (no wording change).
- `feature`: `Marked done by @<login>, <age> (shows again when its documents change)`; `by someone no
  longer on the hub` when the user is gone. No tool marks or unmarks.

## Web UI

- Board row (in flight and stale lists): right-click (long press, menu key) → `Copy link` (Link
  icon; toast `Link copied` / `Could not copy the link`), separator, `Mark as done` (CircleCheck
  icon). Toast: `Marked <title> as done.` with **Undo**.
- Feature page header: `Mark as done` button (CircleCheck) when the feature is in flight or stale.
  When `done` is set: a line `Marked done by @login, <age>. It shows again when its documents
  change.` with an `Undo` button.
