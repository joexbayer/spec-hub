# Quickstart: validate marking a spec done

## Automated

```sh
pnpm --filter @spec-hub/server exec vitest run test/done test/mcp   # routes, board query, MCP
pnpm --filter @spec-hub/web exec vitest run                         # row menu, feature page, Undo
pnpm check                                                          # the whole gate (machine quiet)
```

Server scenarios (Postgres-backed):

1. Feature A on branch B (spec s1): mark A → no board entry for A; `/features/A` is 200 with
   `versions: []` and `done.by.githubLogin`.
2. Branch B carries A and C: marking A leaves C's entry unchanged.
3. A marked, then a copy reports spec s2 → A is back, built from that copy; `done` is null.
4. A marked, branch B gets a new tip with the same document oids → A stays done.
5. Two copies at s1 and s2 when marking → both marked; a copy at s3 brings A back.
6. A copy that loses its plan (plan oid → null) is new text → A is back.
7. DELETE → A is back (204); non-member 403 on both; a folder with no in-flight copy 404; a second
   member's mark keeps one row per version.
8. A landed feature marked done stays in `/finished` and in the board's landed list.
9. MCP `feature` prints the done line; MCP `board` no longer lists A.

## By hand on the pilot (SC-001)

Mark 070, 106 and 158 done from their board rows: exactly those three leave the overview.
