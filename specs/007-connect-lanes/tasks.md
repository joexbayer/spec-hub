---
description: "Tasks for 007 Connect in two lanes, with troubleshooting"
---

# Tasks: Connect in two lanes, with troubleshooting

**Input**: `specs/007-connect-lanes/` (spec.md FR-001–FR-010, preview.md §1–4)

**Rules for every task**: project CLAUDE.md (no speculative complexity without buy-in); server and
reporter tests use their own `SPECHUB_TEST_DB`; don't run `pnpm check` while other agents test.

### Wave 1 (parallel)

- [X] T001 [P] @implementation [ctx: apps/server/src/db/schema.ts:42-59, apps/server/src/mcp/handler.ts:202-220, apps/server/src/routes/me.ts:27-53, preview.md §4] Server: `membership.agent_seen_at` (migration 0009), touched on each MCP request at most once a minute; `GET /projects/:slug/connect` adds `projectReported` and `agentSeenAt`. Tests.
- [X] T002 [P] @implementation [ctx: packages/extension/scripts/spec-hub:990-1040, apps/server/test/reporter/hardening.test.ts:95-140, packages/extension/README.md, README.md:64-78, preview.md §3] Reporter `status` prints the Agent line (FR-009); reporter tests for its four outcomes; extension README and README describe the two lanes and `status` (FR-010).
- [X] T003 [P] @reasoning [ctx: apps/web/src/features/connect/*, apps/web/test/connect.test.tsx, preview.md §1-2] Web: lanes (FR-001–FR-005, FR-007), agent step from `agentSeenAt` (FR-006), Troubleshooting panel (FR-008). Tests.

### Wave 2

- [X] T004 [deps: T001-T003] @routine `pnpm check` with the machine quiet; review; screenshots.
