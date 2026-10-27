---
description: "Audit the whole repository for over-engineering — what can be deleted, not what is broken."
---

## User Input

```text
$ARGUMENTS
```

Treat any input as a path or subsystem to scope the audit to. With no input, scan
the whole tree.

## Purpose

Scan the repository for **over-engineering only**, not correctness. This is a
whole-tree scan, not a diff review — the target is accumulated weight, the layers
and helpers and speculative features that each looked reasonable on the day they
landed.

Correctness is `__SPECKIT_COMMAND_AGENTIC_VERIFY__`'s job. Do not duplicate it here.

## Scope

Skip vendored and generated trees: `node_modules/`, `.git/`, `vendor/`, `dist/`,
`build/`, `target/`, lockfiles, and anything matched by `.gitignore`.

Read enough of each candidate to be sure. A helper that looks single-use may have
callers you have not grepped for — check before proposing a deletion.

## Findings

One line per finding, ranked biggest cut first:

```
<tag> <what to cut>. <replacement>. [path]
```

Tags:

- `delete` — dead code, or a speculative feature nobody asked for
- `stdlib` — reinvents something the standard library provides
- `native` — a dependency doing what the platform already does
- `yagni` — an abstraction with exactly one implementation or one caller
- `shrink` — same logic, fewer lines

## Rules

- Every finding names a concrete replacement. "This is over-engineered" without a
  replacement is not actionable.
- Do not propose cutting input validation, error handling, security controls,
  accessibility affordances, or platform calibration. Those are load-bearing —
  cut the abstraction, not the safety.
- Do not propose a rewrite. If the cut is bigger than a deletion plus a small
  edit, say so and leave it to a spec.
- Verify before proposing: grep for callers of anything you want to delete.

## Output

Findings, then:

```
Net removable: ~N lines, M dependencies
```

If there is nothing to cut: `Lean already. Ship.`

Never report a percentage or a savings figure against what was "avoided" — the
unbuilt version was never written, so there is no baseline. Count only what is
actually on disk today.

Report only. Change nothing — this command proposes cuts, it does not make them.
