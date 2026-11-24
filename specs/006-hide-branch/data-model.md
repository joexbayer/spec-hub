# Data model: Hide a leftover branch

## `branch_hide` (new, migration 0007)

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid not null → `project.id` on delete cascade | |
| `branch` | text not null | branch short name as reported (`clone_branch.name`) |
| `tip` | text not null | a commit id the branch was reported at when hidden |
| `hidden_by` | text → `user.id` on delete set null | the member who hid it |
| `hidden_at` | timestamptz not null default now() | |

Primary key `(project_id, branch, tip)`. Insert with `on conflict do nothing` (two members hiding at
once leave one row per tip, FR edge case).

**Effective**: a reported `clone_branch` row of the project with the same `name` and `tip`.

## Changed shapes

```ts
// apps/server/src/services/board-query.ts
export interface HiddenBranch {
  branch: string
  hiddenBy: { githubLogin: string; name: string } | null   // null: the user was deleted
  hiddenAt: number                                          // ms, earliest matching row
}
export interface FeatureDetail {
  // … unchanged fields …
  hidden: HiddenBranch[]        // effective hides of branches that carry this feature
}
```

`FeatureVersion`, `Board`, `BranchRef` and the manifest do not change.
