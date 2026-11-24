# Research: Hide a leftover branch

## H1 — Where to apply a hide

**Decision**: in `loadVersionRows` (apps/server/src/services/board-query.ts), the single query that
`loadBoard` and `loadFeature` build every view from (board, work map and dependency views on the web
come from `/board`; MCP `board` and `feature` call the same loaders). The query left-joins
`branch_hide` on `(project, branch name, tip)` and marks the row; `loadBoard` drops marked rows,
`loadFeature` drops them from `versions` and lists them under `hidden`.

**Rationale**: one place, so no view can forget it (FR-003). Core (`buildBoard`, `buildWorkMap`) and
the web graph code stay unchanged.

**Alternatives**: a `hidden` flag on `FeatureVersion` filtered in core — every consumer would have to
respect it; rejected.

## H2 — What a hide is keyed on

**Decision**: one row per `(project, branch, tip)`. Hiding inserts a row for every distinct tip the
project's clones report for that name at that moment (local and remote copies alike); "Show again"
deletes every row for `(project, branch)`.

**Rationale**: FR-002, FR-005 and the reset case (US2 scenario 3) fall out of an equality join. A
branch that moves no longer matches; nothing has to expire it. Old rows are inert and tiny.

**Alternatives**: key on branch name with an "until tip changes" marker — needs per-copy state when
clones disagree; rejected. Key on `(clone, branch)` — a teammate's other clone would show it again;
rejected.

## H3 — Who sees the hide record

**Decision**: `FeatureDetail.hidden` lists, for the feature's dir, branches whose reported copies are
all hidden, each with the hider (login and name, or null when the user is gone) and the earliest
`hidden_at`. A hide row matching no reported copy is not listed (spec edge case).

## H4 — Entry points in the web

**Decision**: a `ContextMenu` (radix, via a new shadcn `ui/context-menu.tsx`) on board rows and on
work-map branch nodes; a `DropdownMenu` button per branch in the feature page's Branches list.
Radix ContextMenu opens on right-click, long press and the menu key. No confirmation dialog: the
action is reversible, and a toast offers Undo.

**Alternatives**: a confirm dialog — two clicks become three and the action is undoable anyway;
rejected.

## H5 — Audit

**Decision**: no `security_event` row. The hide row holds who and when while it matters; hiding is
a board-view choice, not an access or credential change.
