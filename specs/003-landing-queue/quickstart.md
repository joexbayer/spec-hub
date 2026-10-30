# Quickstart: validate 003 end to end

## Prerequisites

From the `spec-hub-dev` skill: the hub running locally, a project `demo` with members alice, bob and
carol, and an MCP client per member (for example Claude Code with `/mcp/demo` and each member's
token).

## Automated checks

```sh
pnpm --filter @spec-hub/core exec vitest run test/landing.test.ts
pnpm --filter @spec-hub/server exec vitest run test/landing.test.ts test/mcp.test.ts
pnpm check
```

## Manual scenarios

| # | Do | Expect | Covers |
|---|---|---|---|
| 1 | Alice's agent calls `land_lock`. | "You hold the landing lock" at once. | US1 |
| 2 | Bob's agent calls `land_lock`. | After 25 s: "position 1, @alice holds it". | US2 |
| 3 | While bob's `land_lock` is waiting, alice's agent calls `land_unlock {landed: true}`. | Bob's call returns "You hold the landing lock" within 5 s. | US2, SC-002 |
| 4 | Bob holds the lock; carol opens it on the dashboard. | Bob's place ends `removed` by carol; the history shows it; a `land_removed` event is in the security log. | US3, US4, FR-012 |
| 5 | Bob holds the lock and stops calling (fake the clock in tests). | After 60 min the lock opens; bob's next call says the hold expired. | US3, FR-009, FR-013 |
| 6 | Carol calls `land_lock` once and then never again while alice holds it. | After 5 min carol's place is gone. | FR-007 |
| 7 | Any agent calls `landing`. | One line for the holder and one per waiter, with estimates. | FR-014 |
