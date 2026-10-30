# Contract: MCP tools

**Endpoint and auth**:

- The tools are served on the endpoint `/mcp/:slug`, alongside 001's `board` and `feature`.
- Auth is unchanged: `requireToken('read')` then `requireMember()`.
- Tools marked **writes** also need the `coordinate` permission. Without it they return
  `isError: true` with "this token can only read; create a new token on the Tokens page", and log
  `coordinate_denied`.

**Common rules**:

- **Feature ids**: `feature` is a number ("104") or a directory name, resolved like 001's `feature`
  tool. An ambiguous id returns the candidates.
- **Answers**: plain text, one line per item, built from `oneLine()`. Text written by members (notes,
  reasons, contract text) is framed as data, as in `formatDocument`.
- **Errors**: `isError: true` with one sentence that says what to do.
- **Hub unreachable**: the client's problem. The command files (extension.md) treat any failure as
  "could not check" and go on silently.

## Read tools (no `coordinate` needed)

### `inbox`

- **Input**: none.
- **Output**:
  ```
  Waiting on you (2):
  - review spec 104-ledger-settlement for @alice, 3h ago: https://<hub>/p/<slug>/f/104-ledger-settlement
  - @carol objected to plan 107-fees, 1d ago: "<reason>"
  You are waiting on (1):
  - agreement from @bob on 006-lease-api for 104-ledger-settlement, 2d ago
  Updates (1):
  - @bob approved spec 101-refunds, 5h ago
  ```
- With nothing at all: `Nothing waiting on you, and you are not waiting on anyone.`

### `check_gate`

- **Input**: `{ feature: string, document: 'spec' | 'plan' }`.
  - `spec`: the check before plan.
  - `plan`: the check before implement, which looks at the spec and the plan.
- **Output**: first line `PASS` or `ATTENTION`, then at most one line per finding, then
  `offer_review: true|false`.
  ```
  ATTENTION
  - @carol objects to spec (version from 002-x, 1d ago): "<reason>"
  - spec needs 1 approval from someone other than the owner; open request: @bob, 3h ago
  offer_review: false
  ```
- With approvals off, no objections and no declines: `PASS` and `offer_review: false`.
- `PASS` is also returned when the caller has a go-on for the current version.

### `contracts`

- **Input**: `{ feature: string, name?: string }`.
- **Without `name`**: one line per contract file (name, size, last change), then the owner.
- **With `name`**: the file's text, framed as data, plus
  `changed after the plan was approved (<date>)` where that applies (FR-034).
- An unknown name lists the names that exist.
- A feature with no contracts gets `No contracts/ folder reported for <dir>.`

### `feature` (001 tool, widened)

`document` gains `'preview'`. It returns the preview text exactly like spec, plan and tasks, or
`No preview.md reported for <dir>.`

## Write tools (`coordinate`)

### `claim_number`

- **Input**: `{ sequence?: string }`; default `spec`.
- **Output**: `Claimed 108 (spec). Use it as the feature number: specs/108-<short-name>.`
- **Timestamp numbering** with `spec`: `This project uses timestamp numbering; no claim is needed.`
- **Unknown sequence**: lists the configured sequences.

### `release_number`

- **Input**: `{ number: integer, sequence?: string }`.
- Releases a claim the caller holds. Releasing someone else's claim is refused.

### `request_review`

- **Input**: `{ feature, document: 'spec'|'plan', reviewers: string[] | 'dependency-owners', note? }`.
  - `reviewers` is 1–10 GitHub logins.
  - `note` is at most 500 characters.
- **Output**: one line per reviewer: `asked @bob (spec from 104-x, committed 2h ago)` or
  `@bob already has an open request for this spec`.
- **Refused**:
  - the caller as reviewer;
  - a non-member;
  - an empty `dependency-owners` set ("this feature depends on no one else's feature");
  - a document the hub hasn't seen ("commit it first").

### `withdraw_request`

- **Input**: `{ feature, document }`.
- Withdraws all of the caller's open requests for that document.

### `ask_agreement`

- **Input**: `{ feature: string, about: string, note?: string }`.
  - `feature` is the caller's feature.
  - `about` is the feature owned by someone else.
- **Output**: `asked @carol about 006-lease-api`.
- **Refused**:
  - the caller owns `about`;
  - the owner isn't a member or is unknown ("no member owns 006-lease-api").

### `go_on`

- **Input**: `{ feature, document }`.
- Records that the caller went on past a check that did not pass, for the current version.
- **Output**: `Noted: going on with spec at this version; it shows on the feature page.`

## Not present, on purpose

There is no tool to approve, object, withdraw a decision, agree or decline (Art. 4.1, FR-006). The
SC-005 test lists the registered tools and asserts that none of them can reach `decision` or
`agreement_request.state`.
