# Quickstart: validate hiding a branch

## Automated

```sh
pnpm --filter @spec-hub/server exec vitest run test/hide    # routes, board query, MCP wording
pnpm --filter @spec-hub/web exec vitest run                 # menus, Hidden branches, Show again
pnpm check                                                  # the whole gate
```

Server scenarios (Postgres-backed, reports through the ingest route):

1. A feature carried only by B at T: hide B → `/board` has no in-flight entry for it; `/features/:dir`
   is 200 with `versions: []` and `hidden: [{ branch: B, hiddenBy: @member }]`.
2. B carries two features: hiding from one removes it from both.
3. B hidden at T, reported again at T2 → counts again; `hidden` is empty.
4. Two clones report B at T and T2; hide B → both tips hidden; one clone reports T3 → only that copy
   counts.
5. B reset to T after moving → hidden again.
6. Local and remote (spec 004) copies at T → one hide hides both.
7. `DELETE` → B counts again; a non-member gets 403 on both routes; an unknown branch 404.
8. MCP `feature` prints the hidden line; MCP `board` no longer lists the feature.

## By hand on the pilot (SC-001)

Hide `106-guardrail-detector-catalogue`, `070-guardrail-models`, `chore/guardrails-merge-main` and
`chore/spec-shipped-status`: 070, 106 and 158 leave the in-flight list; nothing else changes.
