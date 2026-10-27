---
description: "Apply the restraint ladder — rule out the cheap answers before writing code, and flag anything the plan proposes to build that does not need to exist."
---

## User Input

```text
$ARGUMENTS
```

Treat the input as the scope. With no input, apply this to the current plan if one
exists, otherwise to the pending change.

## Purpose

An agent's default failure mode is not laziness. It is eagerness.

Ask for a config loader and you get a plugin system. Ask for one endpoint and you
get a service layer, a repository interface, and a `utils/` package. The code
runs, the tests pass, every line is defensible in isolation — and the feature is
three times the size it needed to be.

Every unnecessary abstraction is something a human must read, something the next
agent must hold in context, and something that can break. Over-building taxes
every future run.

This command is a gate, not a style note. Run it **before** code is generated.

## Configuration

Read `restraint.intensity` from
`.specify/extensions/agentic/agentic-config.yml`. Default `full`.

- **`lite`** — nudge away from obvious over-building; leave judgement calls to the
  author.
- **`full`** — enforce the ladder on every new construct; flag single-caller
  abstractions.
- **`ultra`** — every new file, dependency, and layer must be justified against
  the ladder explicitly, in writing, before it is written.

Prototypes tolerate more, load-bearing production code less. Match the dial to
the stakes rather than to your mood.

## Understand First

The ladder runs **after** you understand the problem, not instead of it.

Read the task and the code it touches. Trace the real flow end to end. Only then
climb. A small diff you do not understand is not restraint — it is laziness
dressed up as efficiency, and the smallest change in the wrong place is just a
second bug.

## The Ladder

For each thing the plan proposes to build, stop at the first rung that holds:

1. **Does this need to exist at all?** If the requirement does not demand it, skip
   it.
2. **Does it already exist in this codebase?** Reuse the helper, util, or pattern
   that is already here. Do not rewrite it.
3. **Does the standard library do this?** Use it.
4. **Does a native platform feature cover it?** Use it.
5. **Does an already-installed dependency solve it?** Use it. Do not add a new one.
6. **Can this be one line?** Make it one line.
7. **Only then**: write the minimum code that works.

The order matters. Most over-building happens because the agent jumps straight to
rung 7 when a higher rung already answered the need.

## Standing Rules

- No abstraction that was not explicitly requested.
- No new dependency that can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Shortest working diff wins — but only once you understand the problem.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- When two standard approaches are the same size, pick the edge-case-correct one.
  Restraint means less code, not the flimsier algorithm.

## Bug Fixes: Root Cause, Not Symptom

A bug report names a symptom. Before patching the path the report walks, grep
every caller of the function you are about to touch.

Fix the shared function once. One guard there is a smaller diff than one guard
per caller — and patching only the reported path leaves every sibling caller
still broken.

## What Restraint Never Cuts

Restraint is about **necessity, not brevity**. Golfed code is its own failure
mode. The result is small *because it is necessary*, and no smaller.

Never cut in the name of restraint:

- **Understanding the problem** — read it fully, trace the real flow
- **Input validation at trust boundaries** — trusting unvalidated input is a bug,
  not minimalism
- **Error handling that prevents data loss**
- **Security** — auth checks, escaping, secret handling are load-bearing
- **Accessibility** — semantic markup and labels are part of "necessary"
- **Calibration the real platform needs** — a clock drifts, a sensor reads off;
  the hardware is never the spec ideal
- **Anything explicitly requested**

Cut the abstraction, not the safety.

When the project has a security baseline at
`.specify/extensions/agentic/templates/security-baseline.md`, its non-negotiable
floor overrides any necessity finding. A control that looks like over-building
to you may be the thing an obligation rests on — flag it as a question, never as
a cut.

## Leave One Runnable Check

Lazy code without its check is unfinished. Non-trivial logic leaves behind ONE
runnable check: the smallest thing that fails if the logic breaks. An
assert-based self-check or one small test file — no frameworks, no fixtures.

Trivial one-liners need no test.

## Marking Deliberate Shortcuts

When you knowingly cut a real corner with a known ceiling — a global lock, an
O(n²) scan, a naive heuristic — leave a marker comment naming **both** the
ceiling and the upgrade trigger:

```
# agentic:debt global lock on the cache; fine under ~50 rps, swap for a striped
# lock when write contention shows up in the p99
```

A marker with no upgrade trigger rots silently into "later means never".
`__SPECKIT_COMMAND_AGENTIC_DEBT__` harvests these into a ledger.

## Output

One line per finding, biggest cut first:

```
<tag> <what to cut>. <replacement>. [path or plan section]
```

Tags:

- `delete` — dead code, or a speculative feature nobody asked for
- `stdlib` — reinvents something the standard library provides
- `native` — a dependency doing what the platform already does
- `yagni` — an abstraction with exactly one implementation or one caller
- `shrink` — same logic, fewer lines

End with the net lines and dependencies removable.

If there is nothing to cut: `Lean already. Ship.`

Do not report a percentage saved. The unbuilt version was never written, so there
is no baseline to subtract from — a number there would be invented.
