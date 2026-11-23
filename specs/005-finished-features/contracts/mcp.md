# Contract: MCP tools, finished features

Read-only (`readOnlyHint: true`), `requireToken('read')` + `requireMember()`, as spec 001's tools.

## `finished` (new)

Input: `query` (optional, ≤ 255 chars: title words, folder name or number), `owner` (optional GitHub
login, without `@`).

Output: one line per finished feature, newest landing first, at most 200, then `… and N more`:

```
Finished in ai-gateway (136):
150 Operators sign in with a passkey, witho…  @aaaknowit  landed 2d ago  tasks 71/73  (in flight again)
079 Tenant keys                               @joexbayer  landed 2d ago  tasks 40/40
141 Platform foundation                       Joe Bayer   landed 6d ago
```

No listing yet: `No finished features reported yet; they appear once a connected clone that has
fetched main reports.` No match: `No finished feature matches "<query>".` Titles and names pass
through `oneLine()`.

## `feature` (changed)

- Finds every finished feature (by number or folder name), not only recently landed ones; the
  not-found answer becomes `no feature <id> in flight or finished`.
- New optional `branch` argument: which version to describe or whose `document` to return. Omitted:
  the in-flight version if there is one, else the default branch.
- A finished feature's answer includes `Landed <when>`, its owner and tasks, and `Also in flight on
  <branch>` when it is.

## Review follow-ups (2026-11-23)

- `feature` with `branch` set to the default branch describes the finished version (owner, tasks,
  landed time) and adds `Also in flight on <branches>` when it is.
- `finished` with an owner filter that matches nothing answers `No finished feature by <owner>`.

## Extra documents (FR-016)

`feature`'s `document` argument accepts `spec`, `plan`, `tasks` or the name of an extra document,
with or without `.md` (`preview`), at most 64 characters. Unknown names answer `not present on
<branch>` like a missing document.
