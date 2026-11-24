# Research: Mark a spec as done

## D1 — Unit: a feature's document version, not a branch

**Decision**: a mark is keyed on `(project, dir, docs_key)`, where `docs_key` is
`<spec_oid|->:<plan_oid|->:<tasks_oid|->` of a reported copy (`clone_feature`).

**Rationale**: "this spec is done" is about the spec. The first build keyed on `(branch, tip)`,
which hid every spec on the branch (the pilot's `106-guardrail-detector-catalogue` carries 070 and
106; `chore/staging` dozens) and came back on any commit to the branch, even one unrelated to the
spec. Keying on the document text matches spec 004's rule for new work (text main never had): a copy
with new text is new work; anything else is not.

**Alternatives**: `(dir, branch, tip)` — comes back on unrelated commits (a deploy branch moves daily);
rejected. A plain "done" flag per dir — hides new work forever; rejected (Art. 3).

## D2 — Where to apply

**Decision**: unchanged from the first build: `loadVersionRows` left-joins the mark and returns
`doneAt`/`doneBy`; `loadBoard` and `loadFeature` drop marked rows.

## D3 — Extras

**Decision**: `preview.md` and other extra documents are not part of `docs_key`. A preview-only edit
on a leftover branch is rarely new work, and folding a jsonb list into the key adds code for little.

## D4 — The first build

**Decision**: remove it. Migration 0008 drops `branch_hide` (0007 is already applied on the pilot's
hub, so it stays in history).
