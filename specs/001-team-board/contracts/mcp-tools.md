# Contract: MCP tools

- **Endpoint**: `<hub_url>/mcp/:slug`, MCP over Streamable HTTP, stateless. It serves both the
  2026-07-28 protocol and the 2025 one.
- **Auth**: `Authorization: Bearer <token>`. The token needs permission `hub: read`, and its user
  must be a member of `:slug`.
- **Errors**: 401 for a bad token, 403 for a non-member, 404 for an unknown project. These are
  returned before any MCP processing.
- **Annotations**: every tool has `readOnlyHint: true` (FR-024). There are no other tools in this
  feature, and no tool can ever approve or object (Art. 4.1).

## `board`

- **Input**: none.
- **Output**: text, one line per in-flight feature, most recently changed first. This answers SC-005
  in one call. Example:

```text
pilot — 6 in flight
112 Team board            @joexbayer   Implement 7/19  2h ago  112-team-board (not pushed)
109 Usage export          @bob Plan          1d ago  109-usage-export
107 Lease renewal         @alice   Specify         3d ago  107-lease-renewal  ⚠ number 107 also used by 107-quota-alerts (@carol)
…
Recently landed: 104 Ledger settlement (2d ago), 103 Public surface DB safety (5d ago)
Stale (no change in 14 days): 2 — ask for them with feature
```

## `feature`

Input (zod):

```ts
z.object({
  id: z.string().min(1).max(255)
    .describe('Feature number ("104") or directory name ("104-ledger-settlement")'),
  document: z.enum(['spec', 'plan', 'tasks']).optional()
    .describe('Return the full text of this document'),
})
```

**Output without `document`**: about 10 lines of text. It gives the title, owner, phase and
progress, open clarifications, every branch that carries the feature (with owner, pushed state and
last change), whether it is a change to a landed feature, and any collision. It also lists what the
feature depends on and what depends on it, each with its state, for example `depends on 099
(Implement 4/9), blocks 114 (Plan)`.

The `board` output marks blocked entries with `⛔ blocked by 099`.

**Output with `document`**: that document's full committed text from the version shown, preceded by
one header line with its oid and last change. It returns "too large to display" or "not present"
when that applies.

Errors are returned as `isError: true` tool results:
- **Unknown id**: "no feature 104 in flight or recently landed".
- **Ambiguous number**: when a number matches several directories, the result lists them so the
  agent can ask again with the directory name.
