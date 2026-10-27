# Contract: reporter ↔ hub (HTTP)

Used only by `spec-hub` (see [extension.md](extension.md)). The base is
`<hub_url>/api/r/:slug`.

Every request:
- carries `Authorization: Bearer <token>`;
- needs a token with permission `hub: report`;
- needs the token's user to be a member of `:slug`.

Status codes:
- **401**: missing, invalid, revoked or disabled token.
- **403**: not a member, or the clone id belongs to another user.
- **404**: no such project.

The reporter records 401, 403 and 404 for the once-a-day notice (FR-006). Any other failure,
including no network, is silent.

## `GET /config`

Response 200:

```json
{ "defaultBranch": "main", "numbering": "sequential", "maxDocumentBytes": 524288, "login": "joexbayer" }
```

## `POST /reports`

Body limit 1 MiB (FR-010). The body is validated by `ReportManifest` (zod, `packages/core`):

```json
{
  "cloneId": "0b6f…uuid",
  "generatedAt": 1793001234567,
  "commitEmail": "joe@example.com",
  "objectFormat": "sha1",
  "default": {
    "branch": "main",
    "tip": "53cba2ab…",
    "tipAt": 1792990000,
    "dirs": ["001-foo", "002-bar"]
  },
  "branches": [
    {
      "name": "112-team-board",
      "tip": "9f1e…",
      "tipAt": 1793001200,
      "pushed": false,
      "features": [
        {
          "dir": "112-team-board",
          "lastChangeAt": 1793001200,
          "author": { "name": "Joe", "email": "joe@example.com" },
          "docs": {
            "spec":  { "oid": "a1b2…", "size": 14211 },
            "plan":  null,
            "tasks": null
          }
        }
      ]
    }
  ]
}
```

Limits:
- **Counts**: at most 500 branches, at most 200 features per branch, at most 5,000 `default.dirs`.
- **Strings**: names at most 255 characters, emails at most 320.
- **Object ids**: 40 hex characters (`sha1`) or 64 (`sha256`), lowercase, matching `objectFormat`.
- **Times**: Unix seconds, except `generatedAt`, which is in milliseconds.
- `default` is null when the clone has never fetched the default branch.

Responses:
- **200** `{ "accepted": true }`: stored atomically, replacing this clone's previous report.
- **200** `{ "accepted": false, "reason": "stale" }`: `generatedAt` is not newer than the stored
  report, so nothing changed.
- **409** `{ "missing": ["a1b2…", …] }`: the listed documents (each at most `maxDocumentBytes`) are
  not stored yet. The reporter uploads them and posts again, once. Nothing was changed.
- **413**: the body is too large. **422**: validation failed. Nothing was changed in either case.

## `PUT /blobs/:oid`

- **Body**: raw bytes (`Content-Type: application/octet-stream`), limited to `maxDocumentBytes`.
- **The hub** computes the git blob id of the bytes and requires it to equal `:oid`. It decodes the
  bytes as UTF-8 (setting `unreadable` if they aren't valid UTF-8), parses the facts, and stores the
  document under `(project, oid)`. The upload is idempotent.

Responses:
- **204**: stored, or already present.
- **413**: too large.
- **422**: hash mismatch or malformed oid.

Documents larger than `maxDocumentBytes` are never uploaded. The manifest's `size` tells the hub to
show "too large to display" (FR-010, edge cases).
