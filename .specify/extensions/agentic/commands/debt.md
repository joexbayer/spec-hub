---
description: "Harvest agentic:debt markers into a tracked ledger so deliberate shortcuts do not rot into 'later means never'."
---

## User Input

```text
$ARGUMENTS
```

Optional path to scope the scan to. With no input, scan the whole tree.

## Purpose

A deliberate shortcut is fine. An *unrecorded* deliberate shortcut is how a
codebase acquires ceilings nobody remembers agreeing to.

This command collects every debt marker in the tree into one ledger, so the
deferrals stay visible and reviewable.

## Scan

Grep the repository for marker comments:

```bash
grep -rnE '(#|//|--|/\*) ?agentic:debt' . \
  --exclude-dir={node_modules,.git,vendor,dist,build,target}
```

Also match the bare `ponytail:` marker — the convention this borrows from — so
repositories already using it are picked up.

## Ledger

One row per marker, grouped by file:

```
<file>:<line>
  simplified: <what was cut>
  ceiling:    <the limit named in the comment>
  upgrade:    <the trigger to revisit>
```

Tag any marker that names no upgrade trigger as **`no-trigger`**. Those are the
dangerous ones: a ceiling with no revisit condition is a decision that will never
be revisited. List them together at the end under their own heading.

## Output

The ledger, then:

```
N markers, M without an upgrade trigger
```

If there are none: `No debt markers. Clean ledger.`

Report only, change nothing. Do not fix the shortcuts, do not add missing
triggers, and do not judge whether each one was worth taking — this is an
inventory. Acting on it is a separate decision.

## Feeding the Compounding Layer

If the same ceiling appears in three or more places, that is not a shortcut any
more — it is an architectural constraint the codebase has adopted by accident.
Raise it in the next `__SPECKIT_COMMAND_AGENTIC_RETROSPECTIVE__` as a
constitution amendment candidate.
