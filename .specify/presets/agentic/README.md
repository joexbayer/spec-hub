# Agentic Engineering Workflow — a Spec Kit preset

Replaces three core [Spec Kit](https://github.com/github/spec-kit) commands —
`plan`, `tasks`, `implement` — with versions that add a design review gate,
per-task capability routing, parallel wave execution, and orchestrator-side context
injection.

Built on Spec Kit **v0.14.2**'s command bodies, so upstream's hook handling,
handoffs, and script contracts are preserved. Only the workflow additions differ.

Pairs with the [`agentic` extension](<agentic-extension-repo-url>/tree/main/extensions/agentic),
which adds the verify gate and the retrospective loop on the other side of
`implement`. The two are independent — either works alone.

## What each command gains

### `speckit.plan` — Phase 2: pre-task review

After the usual research and design phases, the plan produces a `preview.md`:
code sketches for the 2–4 most load-bearing parts of the feature, a Mermaid
architecture diagram, and an explicit list of assumptions. Then it **stops** and
waits for approval.

Real signatures and real types, not pseudocode — the sketch has to be concrete
enough that a reviewer can disagree with it. This is the cheapest place to catch
a wrong design: at the sketch, not at the diff.

### `speckit.tasks` — routing, context, waves

Task format gains three annotations:

```text
- [ ] T012 [P] [deps: T003,T007] [US1] @reasoning [ctx: src/db/schema.ts:20-90] Create User model in src/models/user.py
```

- **`@routine` / `@implementation` / `@reasoning`** — the capability the task
  needs. Extraction is routine; a function body the plan already specifies is
  implementation; new design or a cross-component change is reasoning. Tags
  never name a provider or model. Legacy `@haiku`/`@sonnet`/`@opus` tags in
  existing `tasks.md` files are read as aliases.
- **`[ctx: file:Lstart-Lend]`** — the exact ranges the executing subagent needs,
  budgeted at 30–150 lines. Not whole files.
- **`[deps: T###]` + `### Wave N` headers** — explicit dependencies, and parallel
  groups that run concurrently with a commit gate between waves.

It also enforces task sizing: a task too large for one prompt doesn't fail loudly,
it silently drops requirements. Fewer than 5 tasks for substantial work is a
warning sign.

### `speckit.implement` — waves, routing, injected context

Executes waves concurrently, committing between them so each wave reads fresh
state. Routes each tag to the agent configured in `routing.roles` of
`.specify/extensions/agentic/agentic-config.yml`, after a preflight that stops
with a `ROUTING_*` error if a configured agent is missing or cannot run as a
subagent, and reports which agent actually ran each task. With no config,
everything runs inline. See the extension's
[routing docs](../../extensions/agentic/docs/routing.md). And for every `[ctx: ...]` task, the orchestrator
reads the ranges **before** dispatching and inlines the actual content under a
`## Pre-Fetched Context` heading, with an `## Allowed Operations` allowlist.

Subagents are told not to grep outside those paths, and to abort with
`CONTEXT_INSUFFICIENT: <reason>` rather than silently widening scope — one retry
with expanded ranges, then escalation. A subagent left to rediscover the codebase
spends 30–70% of its budget on reads the orchestrator already did.

Retries are capped at 3 per task before escalating.

## Install

```bash
git clone <agentic-extension-repo-url>
specify preset add --dev agentic-extension/presets/agentic
```

Presets replace core commands, so `plan`, `tasks`, and `implement` change
behaviour after install. Remove the preset to get upstream's versions back.

## Layout

```
preset.yml
commands/speckit.plan.md
commands/speckit.tasks.md
commands/speckit.implement.md
```

## Further reading

| Article | Covers |
|---|---|
| [Model Routing](https://wiki.joexbayer.dev/wiki/model-routing-haiku-sonnet-opus) | Choosing a tier, and why routing drives cost |
| [Subagents and Context Injection](https://wiki.joexbayer.dev/wiki/subagents-and-context-injection) | The `[ctx: ...]` protocol and why it saves 30-70% |
| [Spec-Driven Workflow](https://wiki.joexbayer.dev/wiki/spec-driven-workflow) | Where plan/tasks/implement sit in the pipeline |
| [Agentic Engineering](https://wiki.joexbayer.dev/wiki/agentic-engineering) | The method these commands implement |

## Requirements

Spec Kit `>=0.14.0`.

## License

MIT
