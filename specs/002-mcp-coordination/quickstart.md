# Quickstart: validate 002 end to end

Prerequisites, from the `spec-hub-dev` skill:

- the hub running locally;
- a project `demo` with members alice (admin) and bob;
- each member has a token and a connected clone of a throwaway repository that uses stock Spec Kit
  plus the Spec Hub extension.

## Automated checks

```sh
pnpm --filter @spec-hub/core exec vitest run test/policy.test.ts test/gate.test.ts test/inbox.test.ts
pnpm --filter @spec-hub/server exec vitest run test/coordination test/mcp-coordination.test.ts
pnpm --filter @spec-hub/server exec vitest run test/reporter      # Art. 3.6, now with the new manifest fields
pnpm check
```

## Manual scenarios

| # | Do | Expect | Covers |
|---|---|---|---|
| 1 | No policy keys in the config. As alice, run `/speckit-specify`, then `/speckit-plan`, then `/speckit-implement`. | No review offer and no gate message. The only hub-related output is Spec Kit's own hook header lines. | SC-011, FR-016, FR-024 |
| 2 | Alice and bob both call `claim_number` within a second. | Different numbers, each above every known number. | SC-004, FR-017 |
| 3 | Bob's agent calls `contracts` on alice's feature, then reads `lease.md`. | Its text, owner @alice, and its last change. | US9 |
| 4 | A feature with `preview.md` holding a flowchart and a sequence diagram. | Feature page Preview tab, both diagrams drawn in light and dark; `feature … document: preview` returns the text. | US8, SC-009 |
| 5 | Bob's agent calls `ask_agreement` about alice's feature. Alice declines on the dashboard with a reason. | Alice's inbox count goes 1 → 0. Bob's `inbox` shows "@alice declined: <reason>". Bob's next `check_gate` shows the decline. | US5, US2 |
| 6 | Set `spec_approvals: 1` on the default branch and report. Alice runs `/speckit-specify`. | One offer: "Ask someone to review this spec?" Answer "bob", and bob has exactly one inbox item. | FR-024, US1 |
| 7 | Alice runs `/speckit-plan` before bob answers. | One message, "spec needs 1 approval…; open request: @bob". Say "yes, do as I say": the agent goes on and the feature page shows "went on without approval". Running `/speckit-plan` again doesn't ask. | FR-016b, SC-010 |
| 8 | Bob approves on the dashboard. Alice edits the spec, commits, and opens the feature page. | "Approved by @bob, changed since" with the line diff. The gate passes (`approval_survives_change` defaults to true). | US6, FR-009 |
| 9 | Remove bob. Alice's project has one member. | No review offers, and every gate passes. | FR-016a, SC-010 |
| 10 | Use a token without `coordinate` (created in the test, since the UI has no such option), and try `claim_number`, `request_review` and `go_on`. | Each is refused with the "can only read" line and logged as `coordinate_denied`. No tool can approve (the tool list has none). | FR-023, SC-005 |
| 11 | Stop the hub, then run `/speckit-plan`. | It carries on with no output from the gate. | Art. 3.6 |
