# Interfaces: Hide a leftover branch

## Web API (session cookie, Origin-checked like every mutation)

### `POST /api/projects/:slug/hidden-branches`

Body `{ "branch": string }` — 1–255 characters, no control characters.

- Any project member (`requireProjectRole()`); non-member 403, unknown project 404.
- Inserts one `branch_hide` row per distinct tip the project's clones currently report for that
  name. No reported copy: `404 { "error": "no such branch" }`.
- The project's default branch: `400 { "error": "the default branch cannot be hidden" }`.
- `200 { "branch": string, "tips": number }`.

### `DELETE /api/projects/:slug/hidden-branches?branch=<name>`

- Any project member. Deletes every hide of that branch in the project. `204`, also when there was
  none.

### `GET /api/projects/:slug/features/:dir` (changed)

Adds `hidden: HiddenBranch[]` (data-model.md). `versions` no longer contains hidden copies. The
response is 200 (not 404) when the feature's only copies are hidden.

### `GET /api/projects/:slug/board` (unchanged shape)

Hidden copies are not counted.

## MCP

- `board`: hidden copies are not counted (no wording change).
- `feature`: after the counted branches, one line per hidden branch:
  `Hidden branch <name>: hidden by @<login>, <age> ago (counts again on its next commit)`;
  `hidden by someone no longer on the hub` when the user is gone. No tool hides or shows.

## Web UI

- Board row: right-click (long press, menu key) → menu:
  - `Copy link` (Link icon): copies `<origin>/p/<slug>/f/<dir>`; toast `Link copied`, or
    `Could not copy the link` when the clipboard is unavailable.
  - separator, label "Hide a branch (for all its features)", then one item per branch of the row:
    `Hide <branch>` (EyeOff icon). Toast: `Hid <branch> for everyone.` with **Undo**.
- Work map: right-click a branch node → `Hide this branch` (EyeOff icon).
- Feature page, Branches list: a `⋯` button per branch → `Hide this branch` (EyeOff icon). Below it, "Hidden
  branches": `<branch> — hidden by @login, <age>` with **Show again**.
- Help line under Hidden branches: "Hidden for everyone until someone commits to the branch."
