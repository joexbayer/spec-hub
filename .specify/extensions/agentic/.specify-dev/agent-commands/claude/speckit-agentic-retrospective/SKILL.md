---
name: speckit-agentic-retrospective
description: Structured post-mortem on the completed feature — produces constitution amendments and skill candidates so the next run starts ahead of this one.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: joexbayer
  source: agentic:commands/retrospective.md
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Purpose

Feed the lessons of this run back into the next one. Failures compound if
ignored; efficiency compounds if captured.

This step has the highest long-term leverage and the least visible per-run
payoff, which is exactly why it gets skipped under time pressure. **Never skip
it when rushed.**

## Prerequisites

Run this only after `/speckit-agentic-verify` returned `PASS` or
`PASS-WITH-WARNINGS`. If blockers remain, fix them first — a retrospective on
broken work records the wrong lessons.

## Configuration

Read `.specify/extensions/agentic/agentic-config.yml` if it exists. Use
`paths.retrospectives`, `paths.known_failures`, and `promotion.threshold`.
Defaults if the file is absent: `.specify/extensions/agentic/docs/retrospectives`,
`.specify/memory/known-failures.md`, threshold `3`.

## Steps

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` and parse `FEATURE_DIR`, `FEATURE_SPEC`, `IMPL_PLAN`, `TASKS`.
2. Read the spec, plan, and tasks for the completed feature.
3. Read the verify findings from this run if they were saved; otherwise ask the
   user to paste them, or note that they were not retained.
4. Review the implementation diff for the feature.
5. Identify friction points, surprises, and patterns worth repeating. Be
   specific — "context was unclear" teaches nothing; "the task paraphrased the
   contract instead of quoting it, so a field was dropped" is a rule waiting to
   be written.
6. Fill in the template at
   `.specify/extensions/agentic/templates/retrospective-template.md`.
7. Write the `CONSTITUTION_AMENDMENTS` block — rules that would have prevented a
   failure observed in THIS run.
8. Write the `SKILLS_TO_EXTRACT` block — reusable patterns with triggers,
   preconditions, and concrete steps. An unstructured snippet is not a skill.

## Known-Failures Registry

Update the registry at `paths.known_failures` before finishing. If it does not
exist yet, create it from
`.specify/extensions/agentic/templates/known-failures-template.md`.

1. For each failure pattern in `CONSTITUTION_AMENDMENTS`, add a new row or
   increment the count of the existing category.
2. When a category's count reaches `promotion.threshold`, it stops being a
   suggestion and becomes an enforced rule: move it to **Promoted to
   Constitution** and run `/speckit-constitution` to add it.

   If the project has no constitution yet, seed it from
   `.specify/extensions/agentic/templates/constitution-baseline.md` first.
3. Below the threshold, leave it pending. The threshold is what separates a real
   pattern from one-off noise — do not promote early.

## Debt Ledger

Run `/speckit-agentic-debt` and include the count in the retrospective.

A shortcut taken during this feature is part of what the feature cost. If the same
ceiling now appears in three or more places, it is no longer a shortcut — the
codebase has adopted an architectural constraint by accident, and that belongs in
`CONSTITUTION_AMENDMENTS`.

Markers tagged `no-trigger` are the ones to raise: a ceiling with no revisit
condition will not be revisited.

## Output

Save the completed retrospective to
`<paths.retrospectives>/<feature-slug>.md`.

Print a short summary: amendments proposed, skills identified, and any category
that crossed the promotion threshold.

Then run `/speckit-agentic-skills` to promote the skill candidates.