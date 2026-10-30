# Research: Coordination over MCP

No open NEEDS CLARIFICATION items remained after reading the spec, the constitution and the 001
code. Each entry below records a design decision.

## R1 — How the hub learns the project's policy

- **Decision**: the reporter adds the blob id of `.specify/extensions/spec-hub/spec-hub-config.yml`
  on the default branch to the manifest (`default.config`). The existing 409 → PUT blob flow uploads
  it once per change. The hub stores the oid on `project.config_oid` and parses the text with
  `parsePolicy` in core whenever it needs the policy.
- **Rationale**: Art. 2.3 says policy lives in the repo. Only the default branch counts, so a
  branch can't loosen the rules for itself. It reuses the content-addressed blob path from 001.
- **Alternatives**: settings in the admin UI (rejected by Art. 2.3); parsing on ingest and storing
  JSON (a second copy that can drift from the oid; parsing a 2 KB file per check is trivial).

## R2 — Approvals off by default

- **Decision**: the default `spec_approvals` and `plan_approvals` are `0`, which means approvals are
  off. With approvals off, `check_gate` still reports open objections and declines, the offer flag
  is always false, and the dashboard still lets anyone approve or object.
- **Rationale**: FR-016 and FR-041 make 002 a benefit, not a process.

## R3 — What a coordination record points at

- **Decision**: requests, decisions and go-ons key on `(project_id, dir, kind, oid)`; agreement
  requests on `(project_id, from_dir, target_dir)`.
- **Renames**: when a dir has no records, the hub also looks for records under a dir that has the
  same feature number and the same owner and is no longer in flight or landed. This is a read-time
  lookup with no data migration.
- **Rationale**: the spec's rename edge case, at the cost of one extra query on an empty result.
- **Alternatives**: keying on the feature number (breaks in timestamp projects and when two features
  collide on a number); a stable feature id (needs identity tracking that 001 doesn't have).

## R4 — Which version a check or request uses

- **Decision**: use the caller's own newest reported version of the feature. Without one, use the
  version the board shows (001's `compareVersions` order).
- **Rationale**: the spec's "requester's own most recent report" rule. The agent checks what its
  developer is working on.

## R5 — Hooks into Spec Kit, and stock Spec Kit

- **Decision**: the extension adds three Spec Kit commands, registered as mandatory hooks
  (`optional: false`, so Spec Kit never asks):
  - `speckit.spec-hub.claim` before `specify`;
  - `speckit.spec-hub.gate` before `plan` and before `implement`;
  - `speckit.spec-hub.after` after `specify` and after `plan`.

  Each command first checks for a Spec Hub MCP tool. If there is none, it ends without output.
- **Rationale**: extension hooks are part of stock Spec Kit (`.specify/extensions.yml`), so no other
  extension is needed (FR-039). Mandatory hooks don't prompt. Optional ones print a prompt on every
  run, which breaks SC-011.
- **Known cost**: Spec Kit prints its own one-line "Automatic Hook … Executing" header for mandatory
  hooks. That is Spec Kit's text, not a question, and it can't be removed from the extension side.
  See preview.md Assumption 1.

## R6 — The review offer

- **Decision**: `after.md` calls `check_gate` for the document just written. The agent asks the
  developer "ask someone to review?" only when the answer has `offer_review: true`. That is true only
  when the policy requires approvals for this kind, there is someone other than the owner to ask,
  no request is open and the document isn't already approved.
- **Rationale**: the hub, not a static prompt, decides when an offer helps. FR-024 and SC-010 hold
  by construction.

## R7 — The `coordinate` token permission

- **Decision**:
  - A new permission `coordinate` in the api-key `hub` statement.
  - New tokens get `['report', 'read', 'coordinate']`.
  - Migration 0004 adds `coordinate` to every existing key that has `read`.
  - `requireToken('read')` sets `c.var.permissions` from the verified key, and state-changing tools
    refuse without `coordinate`.
- **Rationale**: FR-023, plus the "no new setup step" line of the annoyance budget.
- **Check during implementation**: how the plugin stores `permissions` (a JSON text column), so the
  migration edits the right shape.

## R8 — Concurrent claims

- **Decision**: inside one transaction, take `pg_advisory_xact_lock(hashtext(project_id || ':' ||
  sequence))`, compute the next number, and insert it. The primary key is `(project_id, sequence,
  number)`.
- **Rationale**: FR-017 requires different numbers for concurrent claims. A per-project lock is one
  line, and claims are rare (a few a day).
- **Alternatives**: insert and retry on a unique violation (more code for the same result).

## R9 — Further numbered sequences (FR-017a)

- **Decision**:
  - The config declares `sequence_<name>: <dir>/<N…>-*<ext>`, for example
    `sequence_adr: docs/adr/NNNN-*.md`. The width is the number of `N`s.
  - The reporter reads these keys itself, with the same flat-key `cfg` reader.
  - For the default branch and each reported branch, it runs one `git ls-tree --name-only` per
    sequence directory and sends the matching numbers. That is up to 2000 per sequence per branch,
    and up to 5 sequences.
  - The numbers are stored as `clone_branch.sequences` (jsonb) and `project.default_sequences`.
- **Rationale**: claims need "the highest number known", and "fulfilled" needs to see the number
  appear. One `ls-tree` per sequence per branch adds a few milliseconds to the background report.
- **Spec numbers** keep using the feature dirs 001 already reports; sequence `spec` is built in.

## R10 — Contracts and preview in reports

- **Decision**:
  - Each manifest feature gains `preview: DocRef` and `contracts: [{ name, oid, size }]`, with at
    most 50 contracts, and names limited to one path segment under `contracts/`.
  - Ingest stores the preview on `clone_feature.preview_oid/size`, and contracts in a new
    `clone_contract` table.
  - The documents and their size limits are the 001 ones.
- **Rationale**: the same machinery as spec, plan and tasks. Contracts are a list, so they need a
  table.

## R11 — "Changed since" view

- **Decision**: the web computes a line diff with `diff` (jsdiff, MIT, no dependencies) between the
  decided version and the current one. `diff@9.0.0` is already in the lockfile through the test
  tooling, so the web takes a direct dependency on that same version and nothing new is downloaded. The server returns both texts by oid.
- **Rationale**: an established library in place of a hand-written diff. Documents are capped at
  512 KB, so a client-side diff is fast.
- **Alternatives**: a server-side diff (no benefit; the client already renders).

## R12 — Session-start line (FR-028)

- **Decision**:
  - A reporter command `spec-hub inbox --line` calls `GET /api/r/:slug/inbox/summary` with the
    stored token. It prints one line when items need the person and nothing otherwise, including
    when the hub is down (`--max-time 3`).
  - The README documents a Claude Code `SessionStart` hook that runs it. Nothing installs that hook.
- **Rationale**: Art. 2.4 says agent-specific extras are optional.

## R13 — Going on past a check (FR-016b)

- **Decision**: a tool `go_on(feature, document)` records `(project, dir, kind, oid, user)`. It needs
  `coordinate`; with a read-only token, the gate command tells the agent to go on without
  recording. `evaluateGate` passes when the caller has a go-on for the current oid.
- **Rationale**: one row per confirmation, never counted as an approval.

## R14 — Inbox: derived, not stored

- **Decision**: there is no inbox table. `buildInbox` in core derives items from open review
  requests, agreement requests, the latest decision per person and document, and claims.
  - **Exactly one item per person per request** follows from the request row being unique per
    reviewer while open.
  - **Removed members**: requests to or from people who are no longer members show as "left the
    project", derived when read.
- **Rationale**: no write path to keep consistent and no backfill. FR-027 holds by construction.

## R15 — Append-only decisions

- **Decision**: a trigger refuses `UPDATE` on `decision`, as the one on `security_event` does.
  `DELETE` is allowed only through the project cascade (deleting a project). The application has no
  delete path.
- **Rationale**: Art. 4.3, with project deletion still working.

## R16 — Security log entries

- **Decision**: these events go to `security_event`:
  - a state-changing tool called without `coordinate` (`coordinate_denied`);
  - a decision attempt on a document version the project hasn't seen (`decision_refused`);
  - a request naming non-members (`request_refused`).
- **Rationale**: FR-030 asks for refused attempts to act for others. These are the only refusals an
  honest client never triggers.
