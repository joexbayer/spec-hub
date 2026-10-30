# Data Model: Coordination over MCP

All of this ships in migration `0004_coordination`. `DocKind2 = 'spec' | 'plan'`. Only these two
kinds carry reviews and decisions.

## New tables

### review_request

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid → project (cascade) | |
| dir | text | |
| kind | enum review_kind (spec, plan) | |
| oid | text | The version that was sent; the hub must have seen it (FR-003). |
| branch | text | Where the pinned version came from. |
| committed_at | timestamptz | The pinned version's last change. |
| requester_id | text → user | |
| reviewer_id | text → user | Never equal to `requester_id` (check constraint). |
| note | text null | At most 500 characters. |
| state | enum request_state (open, answered, withdrawn) | |
| created_at, updated_at | timestamptz | |

- A unique partial index on `(project_id, dir, kind, reviewer_id) WHERE state = 'open'` gives
  FR-004: asking again returns the existing request.
- "Closed, reviewer left" is derived (R14), not stored.
- **State changes**: open → answered when the reviewer records any decision on that document;
  open → withdrawn by the requester.

### decision (append-only, R15)

| Column | Type | Notes |
|---|---|---|
| id | bigserial pk | |
| project_id | uuid → project (cascade) | |
| dir, kind, oid | | The exact version decided on (Art. 4.2). |
| user_id | text → user | Always the signed-in person (Art. 4.1). |
| verdict | enum verdict (approve, object, withdraw) | |
| reason | text null | Required for object and withdraw; at most 2000 characters. |
| self | boolean | `user_id` is the feature's owner at decision time (Art. 4.4). |
| at | timestamptz | |

- **A person's standing** on a document is their latest decision on `(dir, kind)`:
  - **approve**: an approval (of `oid`);
  - **object**: an open objection;
  - **withdraw**: nothing.
- This gives the edge case "an objection stays open until its author withdraws it or approves a
  newer version".

### agreement_request

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| project_id | uuid → project (cascade) | |
| from_dir | text | The requester's feature. |
| target_dir | text | The feature owned by someone else. |
| requester_id | text → user | |
| owner_id | text → user | Resolved when asked; must be a member other than the requester (FR-020). |
| note | text null | At most 500 characters. |
| state | enum agreement_state (open, agreed, declined) | |
| reason | text null | Required for declined. |
| answered_at | timestamptz null | |
| created_at | timestamptz | |

A unique partial index on `(project_id, requester_id, from_dir, target_dir) WHERE state = 'open'`
returns the existing request when someone asks again.

### number_claim

| Column | Type | Notes |
|---|---|---|
| project_id | uuid → project (cascade) | |
| sequence | text | `spec` or a configured name. |
| number | integer | |
| user_id | text → user | |
| state | enum claim_state (held, fulfilled, released) | |
| claimed_at | timestamptz | |
| closed_at | timestamptz null | |

- PK `(project_id, sequence, number)`.
- **Lapsed** is derived: `held` and `claimed_at < now() - 7 days`.
- **Fulfilled** is set during ingest, when a report from the claimer shows the number (a feature
  dir, or a sequence file).
- **Next number**: `max(highest known number, highest claim of any state) + 1` (FR-018: a lapsed
  number isn't reused while a higher one exists).

### go_on

| Column | Type | Notes |
|---|---|---|
| project_id, dir, kind, oid, user_id | | PK over all five. |
| at | timestamptz | |

### clone_contract

| Column | Type | Notes |
|---|---|---|
| clone_id, branch, dir | | FK → clone_feature (cascade). |
| name | text | One path segment, for example `lease.md`. |
| oid | text | |
| size | integer | |

PK `(clone_id, branch, dir, name)`.

## New columns

| Table | Column | Notes |
|---|---|---|
| project | config_oid text null | The default branch's `spec-hub-config.yml` (R1). |
| project | default_sequences jsonb not null default '{}' | `{ adr: [1, 2, …] }` from the default branch. |
| clone_feature | preview_oid text null, preview_size integer null | R10. |
| clone_branch | sequences jsonb not null default '{}' | Numbers found on that branch (R9). |

The `apikey` data migration adds `coordinate` to every key whose `hub` permissions include `read`
(R7).

## Core types (pure, `packages/core`)

```ts
type ReviewKind = 'spec' | 'plan'

interface KindPolicy {
  approvals: number                        // 0 = off (default)
  approvers: ApproverRule[]                // default []
}
type ApproverRule = { kind: 'dependency-owners' } | { kind: 'admin' } | { kind: 'member'; login: string }

interface Policy {
  spec: KindPolicy
  plan: KindPolicy
  selfApprovalCounts: boolean              // default false
  approvalSurvivesChange: boolean          // default true
  sequences: { name: string; dir: string; width: number; prefix: string; suffix: string }[]
}

type PolicyResult = { policy: Policy; errors: string[] }   // errors → admin settings; defaults used
```

`GateResult` and `Inbox` are defined in [preview.md](preview.md) § 2 and § 3.

## Validation (Art. 5.4)

- **Notes**: at most 500 characters. **Reasons**: at most 2000 characters, required where stated.
- **Logins**: at most 39 characters, GitHub's pattern; at most 10 reviewers per request.
- **Sequence names**: `^[a-z][a-z0-9-]{0,30}$`, at most 5.
- **Config file**: at most 16 KB. Unknown keys are reported as errors, and the file is still used.
- **Manifest additions**: at most 50 contracts per feature, at most 2000 numbers per sequence per
  branch; contract names are `^[^/\u0000-\u001f]{1,255}$`.
