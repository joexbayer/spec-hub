# Data model: Teammates' pushed work on the board

## Database (migration `0006_share_pushed_branches`)

| Table | Column | Type | Notes |
|---|---|---|---|
| `project` | `share_pushed_branches` | boolean not null default false | the option (FR-001) |
| `clone_branch` | `remote` | boolean not null default false | the branch was seen on the shared remote, not a local branch of the reporting clone |

## Report manifest (`packages/core/src/manifest.ts`)

`Branch` gains `remote: z.literal(true).optional()` — present only for remote branches, so reports
without the option are unchanged.

## Core types

```ts
interface FeatureVersion { …; remote: boolean }          // from clone_branch.remote
interface BranchRef { branch; pushed; lastChangeAt; carrierUserId: string | null }  // null: seen on the shared remote
```

`projectSettings` (core `project.ts`) gains `sharePushedBranches: z.boolean()`; `projectFields`
defaults it to false on create.

## Board rules (core `buildBoard`)

1. Group versions by folder (unchanged).
2. Within a folder, drop remote versions whose branch name also has a local version.
3. Keep one remote version per branch name: newest `lastChangeAt`, ties by `carrierUserId`.
4. A kept remote version becomes a `BranchRef` with `carrierUserId: null`.
5. Everything else unchanged (shown version, phase, owner, staleness, collisions).

`buildWorkMap`: branches with `carrierUserId: null` hang under one "Shared remote" node
(`person:remote`), never under a member.
