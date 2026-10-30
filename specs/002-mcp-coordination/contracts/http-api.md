# Contract: HTTP routes

**Dashboard routes (session auth)**:

- Middleware: `requireSession` + `requireProjectRole()` (any member).
- Bodies are validated by zod (`zv`), and errors are `{ error: string }`.
- Mutating routes rely on the existing CSRF origin check.
- These routes are the only place a decision or an agreement answer can come from (Art. 4.1).

## Reads

### `GET /api/projects/:slug/inbox`

```ts
{
  needsYou: InboxItem[]
  waitingOn: InboxItem[]
  updates: InboxItem[]
}
// InboxItem: { kind, dir, document?, from, at, requestId?, agreementId?, reason? }
```

The navigation badge shows `needsYou.length` from this same query, which refetches every 60 s.

### `GET /api/projects/:slug/features/:dir/coordination`

```ts
{
  documents: Record<'spec' | 'plan', {
    currentOid: string | null
    requests: { id, reviewer, requester, oid, branch, committedAt, state, note }[]
    decisions: { id, user, verdict, oid, reason, self, at }[]       // full history, newest first
    standing: { user, verdict: 'approve' | 'object', oid, changedSince: boolean }[]
    goOns: { user, oid, at }[]
    gate: GateResult                                                 // as check_gate computes it
  }>
  agreements: { id, fromDir, targetDir, requester, owner, note, state, reason, at }[]
}
```

### `GET /api/projects/:slug/documents/:oid`

`{ content: string | null, tooLarge: boolean }`. The changed-since diff uses it to fetch the decided
version. It is limited to oids that belong to the project.

## Writes

### `POST /api/projects/:slug/features/:dir/decisions`

- **Body**: `{ kind: 'spec'|'plan', oid, verdict: 'approve'|'object'|'withdraw', reason? }`.
  - `reason` is required for `object` and `withdraw`, and is at most 2000 characters.
- The project must have seen `oid` for `(dir, kind)` on some branch; otherwise the answer is 422
  and `decision_refused` is logged.
- `self` is set from the feature's current owner.
- The caller's open request for that document becomes `answered`.
- Returns `201` with the decision.

### `POST /api/projects/:slug/features/:dir/reviews`

`{ kind, reviewers: string[] | 'dependency-owners', note? }`. The same rules as the MCP tool
`request_review`, for asking from the dashboard (FR-001).

### `POST /api/projects/:slug/reviews/:id/withdraw`

Requester only.

### `POST /api/projects/:slug/agreements/:id/answer`

- **Body**: `{ answer: 'agree' | 'decline', reason? }`; `reason` is required for `decline`.
- Owner only, and only while the request is `open`.

## Reporter API (token auth, `/api/r`)

### `GET /api/r/:slug/inbox/summary`

- **Auth**: `requireToken('read')` + `requireMember()`.
- **Response**:
  `{ needsYou: number, line: string | null }`, for example
  `"spec-hub: 2 things wait on you (1 review, 1 objection): https://<hub>/p/<slug>/inbox"`.
- `line` is null when nothing needs the person.

### `POST /api/r/:slug/reports` (001, widened)

Accepts the manifest additions in [extension.md](extension.md) § Manifest.
