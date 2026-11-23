# Data model: Finished features on the hub

## Database (migration `0005_finished_features`)

### `landed_feature` (changed)

One row per folder on the project's default branch. Existing columns keep their meaning.

| Column | Type | Notes |
|---|---|---|
| `project_id`, `dir` | | primary key, unchanged |
| `first_seen_at` | timestamptz | unchanged: when the hub first saw the folder on the default branch |
| `baseline` | boolean | unchanged: on the default branch before the project was connected |
| `added_at` | timestamptz null | **new**: first-parent commit time that brought the folder to the default branch (F3) |
| `last_change_at` | timestamptz null | **new**: newest first-parent commit touching the folder |
| `author_name`, `author_email` | text null | **new**: first committer of `spec.md` (F4) |
| `spec_oid`, `plan_oid`, `tasks_oid` | text null | **new**: documents as on the default branch |
| `spec_size`, `plan_size`, `tasks_size` | integer null | **new** |

The new columns are null until a listing with `features` is stored (rows written only by the `dirs`
step, or before the update). Documents are joined from `document` by `(project_id, oid)`, as for
`clone_feature`.

### `project` (changed)

| Column | Type | Notes |
|---|---|---|
| `finished_tip` | text null | **new**: default-branch commit of the newest stored listing with `features` |
| `finished_tip_at` | timestamptz null | **new**: its commit time; a listing is applied only when newer (FR-005) |

Changing a project's default branch resets both to null, as it already does `default_tip` and
`default_tip_at`.

### Lifecycle of a row

```
(absent) --listing has dir--> stored with facts
stored   --newer listing has dir--> facts updated (documents, times, author)
stored   --newer listing lacks dir--> deleted (removed or renamed, FR-011)
(absent) --dirs step sees dir--> stored without facts (old reporter; landing detection as today)
```

## Report manifest (`packages/core/src/manifest.ts`)

`default` gains `features`, optional:

```ts
const DefaultFeature = z.object({
  dir: DirName,
  addedAt: UnixTime,
  lastChangeAt: UnixTime,
  author: z.object({ name: Name, email: Email }).strict().nullable(),
  docs: z.object({ spec: DocRef, plan: DocRef, tasks: DocRef }).strict(),
}).strict()

const DefaultBranch = z.object({
  branch: Name, tip: Oid, tipAt: UnixTime,
  dirs: z.array(DirName).max(5000),
  features: z.array(DefaultFeature).max(2000).optional(),   // new
}).strict().nullable()
```

Validation adds: unique `features[].dir`; document oids match `objectFormat`. `uploadableOids` and
the too-large markers include the default branch's documents.

## Core types (`packages/core/src/types.ts`)

```ts
/** One landed_feature row joined with its documents' facts. */
export interface FinishedRow {
  dir: string
  firstSeenAt: number
  baseline: boolean
  addedAt: number | null
  lastChangeAt: number | null
  author: { name: string; email: string } | null
  spec: DocFacts | null
  plan: DocFacts | null
  tasks: DocFacts | null
}

/** A finished feature as the list, the API and agents show it. */
export interface FinishedFeature {
  dir: string
  number: string | null
  title: string
  owner: Owner
  /** firstSeenAt, or addedAt for history before the project was connected; null when unknown. */
  landedAt: number | null
  lastChangeAt: number | null
  tasks: { done: number; total: number } | null
  /** Its documents have been reported (false for rows from the dirs step only). */
  reported: boolean
  /** Also in flight or stale on some branch. */
  inFlight: boolean
}
```

`buildFinished(rows, members, numbering, activeDirs): FinishedFeature[]` — pure, newest `landedAt`
first (unknown last), then by `dir`.

`FeatureDetail.landed` (server, `board-query.ts`) becomes:

```ts
landed: {
  dir: string; firstSeenAt: number; baseline: boolean
  branch: string            // the project's default branch name
  finished: FinishedFeature // owner, landing time, tasks
} | null
```

and `shown` can be the default branch's version (`shown.branch === landed.branch`).
