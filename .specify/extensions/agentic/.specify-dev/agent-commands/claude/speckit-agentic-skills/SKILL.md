---
name: speckit-agentic-skills
description: Promote SKILLS_TO_EXTRACT candidates from the latest retrospective into reusable skill files.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: joexbayer
  source: agentic:commands/skills.md
---

## User Input

```text
$ARGUMENTS
```

If the user named a specific retrospective, use that one. Otherwise use the most
recent.

## Purpose

Turn the skill candidates a retrospective identified into artifacts the next run
can actually load. A pattern that stays in a retrospective document is a pattern
nobody applies.

## Configuration

Read `.specify/extensions/agentic/agentic-config.yml` if present, for
`paths.retrospectives` and `paths.skills`. Defaults: `.specify/extensions/agentic/docs/retrospectives` and
`skills/extracted`.

## Steps

1. Find the target retrospective under `paths.retrospectives` (most recent by
   filename date, or by mtime if names are undated).
2. Parse its `SKILLS_TO_EXTRACT` block. If the block is absent or empty, report
   that and stop — do not invent skills.
3. For each candidate, write `<paths.skills>/<skill-slug>.yml`.
4. Skip a candidate that lacks a concrete trigger or concrete steps. Report each
   skip and why. Vague advice is not a skill.
5. If a skill file with that slug already exists, update it rather than creating
   a near-duplicate, and say which fields changed.
6. Update the index at `<paths.skills>/../README.md` to list the current skills.

## Skill Schema

```yaml
name: <slug>
description: <one sentence — what this does and when it applies>
triggers:
  - <observable condition that means "use this now">
preconditions:
  - <what must be true before applying it>
steps:
  - <concrete, ordered action>
references:
  - <path/to/file.ext:LINE-RANGE — the authoritative source, not a copy of it>
examples:
  - context: <scenario>
    usage: <how the skill applies to it>
```

Reference real code by path and line range instead of duplicating it. Copies go
stale; references do not.

## Output

Print: how many candidates were read, how many skills were written or updated,
how many were skipped and why, and the paths touched.