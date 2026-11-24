# Data model: Mark a spec as done

## `feature_done` (new, migration 0008, which also drops `branch_hide`)

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid not null → `project.id` on delete cascade | |
| `dir` | text not null | feature folder (`clone_feature.dir`) |
| `docs_key` | text not null | `coalesce(spec_oid,'-') ':' coalesce(plan_oid,'-') ':' coalesce(tasks_oid,'-')` of a marked copy |
| `done_by` | text → `user.id` on delete set null | |
| `done_at` | timestamptz not null default now() | |

Primary key `(project_id, dir, docs_key)`; insert `on conflict do nothing`.

**Effective** for a reported `clone_feature` row of the project with the same `dir` and the same
computed key.

## Changed shapes

```ts
// apps/server/src/services/board-query.ts
export interface DoneMark {
  by: { githubLogin: string; name: string } | null   // null: the user was deleted
  at: number                                          // ms, earliest matching mark
}
export interface FeatureDetail {
  // … unchanged fields (minus `hidden`) …
  done: DoneMark | null   // set when the folder has marked copies and none that count
}
```

`FeatureVersion`, `Board`, `BranchRef` and the manifest do not change.
