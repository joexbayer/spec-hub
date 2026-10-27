---
name: speckit-agentic-security
description: Derive security requirements for this feature from the baseline and append them to tasks.md as real, tagged tasks — before implementation, not after.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: joexbayer
  source: agentic:commands/security.md
---

## User Input

```text
$ARGUMENTS
```

Treat any input as extra scope or context — a compliance regime that applies, a
threat you already know about, a subsystem to focus on.

## Purpose

`speckit.agentic.verify` catches security problems in code that already exists.
That is the last place to catch them and the most expensive.

This command runs **before implementation**. It reads the spec, plan, and tasks,
works out which security controls this feature actually needs, and writes them
into `tasks.md` as ordinary tasks with IDs and file paths. A control that is a
task gets built and checked off. A control that lives in a review comment does
not.

Scope this to the feature in front of you. This is not a whole-repo audit — that
is `/speckit-agentic-audit` — and not a review of finished work.

## Configuration

Read `security` from `.specify/extensions/agentic/agentic-config.yml`:

- `security.asvs_level` — `1` | `2` | `3`. Default `2`.
- `security.owasp_review` — walk the Top 10 explicitly. Default `true`.
- `security.regimes` — which regulatory regimes apply (e.g. `[cra, gdpr]`).
  Empty means none; do not invent obligations the project has not claimed.
- `security.baseline` — path to the baseline. Default
  `.specify/extensions/agentic/templates/security-baseline.md`.

Read the baseline file. If the project has edited it, **their version wins** —
it reflects obligations you cannot infer from the code.

## Steps

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` and parse `FEATURE_DIR`, `FEATURE_SPEC`, `IMPL_PLAN`, `TASKS`.
2. Read the spec, the plan, and the existing tasks. Read the baseline.
3. **Establish the trust boundaries.** Before naming any control, answer:
   - What untrusted input enters this feature, and where does it arrive?
   - What does it authenticate and authorize, and against what?
   - What data does it read, write, or emit — and is any of it personal or
     secret?
   - What does it call, and what calls it?
   - What runs with more privilege than the caller?

   A control chosen without this is guesswork. If the plan does not answer these,
   say so — that is a gap in the plan, not something to invent an answer for.

4. **Walk the OWASP Top 10:2025** against those boundaries when
   `owasp_review` is on. For each category, one of three outcomes:
   - **Applies** → a task
   - **Not reachable** → one line saying why
   - **Already handled** → name the existing control and where it lives

   Do not skip A03 (Software Supply Chain Failures) or A10 (Mishandling of
   Exceptional Conditions). Both are new in 2025 and are the two most often
   missed, because reviewers pattern-match against the old list.

5. **Apply the regime obligations** in `security.regimes`, and only those.
6. **Check the non-negotiable floor** from the baseline. Anything missing is a
   task regardless of feature size.
7. **Write the tasks into `tasks.md`.**

## Writing the tasks

Security tasks are ordinary tasks. Same format, same rules, same capability tags — they are
not a separate appendix nobody executes.

```text
- [ ] T0NN [P] [deps: T0NN] @implementation [ctx: src/api/handler.go:40-90] SEC-A01 Enforce tenant scoping on GET /reports/{id} in src/api/reports.go
```

Rules:

- Prefix the description with `SEC-<category>` — `SEC-A01`, `SEC-CRA`,
  `SEC-ASVS` — so the tasks are greppable and `verify` can cross-check them.
- **Place each task next to the code it protects**, in the same phase or wave,
  with the right `[deps: ...]`. A security phase bolted onto the end is the first
  thing dropped when the feature runs late.
- Give every task a concrete file path, exactly like any other task. "Review
  authentication" is not a task; "Add authorization check to X in path/y.go" is.
- Tag them honestly, by the rules below: adding a validation call is
  `@implementation`; designing a tenant isolation boundary is `@reasoning`.
- Each non-trivial control leaves one runnable check behind — the smallest test
  that fails if the control is removed. A control with no test is a control that
  will be refactored away.

<!-- agentic:routing:start — shared verbatim by speckit.tasks, speckit.agentic.security and speckit.implement; edit all copies together -->
**Capability tags.** Every task carries exactly one tag naming the capability
the task needs — never the agent, provider or model that runs it:

- `@routine` — bounded lookups, extraction, listings, mechanical edits. No judgement.
- `@implementation` — specified implementation, tests, docs, bulk edits the plan already describes.
- `@reasoning` — ambiguous work, design decisions, architecture, cross-component changes, difficult analysis.

Decide by output shape and judgement scope: extraction → `@routine`; a function
body the plan already specifies → `@implementation`; new design or a change
spanning components → `@reasoning`. Tagging everything `@reasoning` is slow and
expensive on trivia; tagging everything `@routine` produces subtle semantic
failures. The tag sets capability only — a task's allowed paths come from its
`[ctx: ...]`, never from its tag.

New tasks MUST use these three tags. Legacy tags in existing `tasks.md` files stay
valid and are read as aliases: `@haiku` → `@routine`, `@sonnet` → `@implementation`,
`@opus` → `@reasoning`. Never emit a legacy tag, and never rewrite one in place.

Which agent runs each capability is configured in one place —
`routing.roles` in `.specify/extensions/agentic/agentic-config.yml` — so changing
an agent, provider, model or thinking budget never requires editing `tasks.md`.
<!-- agentic:routing:end -->

Do not renumber existing tasks. Append with new IDs and wire dependencies.

## Proportionality

Match the depth to what the feature touches. An internal CLI flag does not need a
threat model; a new authenticated endpoint handling personal data does.

If the feature genuinely needs no new controls, say exactly that and add nothing:

```
No new security tasks. <feature> adds no trust boundary, no new input, and no
new data class. Existing controls at <where> cover it.
```

Manufacturing tasks to look thorough is its own failure — it trains people to
skim security tasks, which is worse than not having them. But never trade away
the non-negotiable floor for proportionality; if the floor has a hole, that is a
task even on a trivial feature.

## Output

```
## Security Requirements — <feature>

Trust boundaries: <one line each>
ASVS level: <n>   Regimes: <list or none>

### Added to tasks.md
T0NN SEC-A01 <description>
...

### Considered, not applicable
A04 Cryptographic Failures — no new data at rest or in transit
...

### Open questions for the human
<anything the spec does not answer — data classification, retention, who may
access what>
```

Anything in that last section is a real gap. Do not resolve it by assumption and
do not bury it — a wrong guess about who may access what is exactly the kind of
error this command exists to prevent.