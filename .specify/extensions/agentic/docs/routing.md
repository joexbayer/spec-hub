# Agent routing

Tasks say what capability they need. Configuration says which agent provides it.
The harness says which provider, model and thinking budget that agent runs on.
Each layer changes without touching the others.

```
tasks.md            agentic-config.yml              harness
@routine        ─▶  routing.roles.routine.agent  ─▶  agent profile ─▶ provider/model
@implementation ─▶  routing.roles.implementation ─▶  agent profile ─▶ provider/model
@reasoning      ─▶  routing.roles.reasoning      ─▶  agent profile ─▶ provider/model
```

## Capability tags

| Tag | For |
|---|---|
| `@routine` | Bounded lookups, extraction, listings, mechanical edits. No judgement. |
| `@implementation` | Specified implementation, tests, documentation. |
| `@reasoning` | Ambiguous work, architecture, difficult analysis, cross-component change. |

`speckit.tasks` and `speckit.agentic.security` write them; `speckit.implement`
reads them. All three carry the same rules block, marked
`<!-- agentic:routing:start -->`, and a test keeps the copies identical.

The tag sets capability only. A task's allowed paths come from its `[ctx: ...]`,
never from its tag.

## Configuration

One block in `.specify/extensions/agentic/agentic-config.yml`:

```yaml
routing:
  roles:
    routine:        { agent: ~ }
    implementation: { agent: ~ }
    reasoning:      { agent: ~, escalate_to: ~ }
  max_escalations: 1
```

- **`agent`**: an agent profile name your harness defines. Never a provider or
  model ID.
- **Empty (`~`)**: that capability runs in the orchestrator session, which is how
  things worked before routing. Upstream ships every role empty, because agent
  names belong to your setup.
- **`escalate_to`**: the only agent a task of that role may move to when its
  output fails validation. If a role has none, it does not escalate: the task
  stops and goes to you.
- **`max_escalations`**: escalations allowed per task. They count against the
  existing 3-retry budget.

`implement` runs a preflight before the first task. It stops with one of these
errors, and never substitutes another agent:

| Error | Meaning |
|---|---|
| `ROUTING_TAG_INVALID` | A task has no capability tag, more than one, or an unknown tag. |
| `ROUTING_AGENT_UNAVAILABLE` | A configured agent is not defined in the harness. |
| `ROUTING_AGENT_UNSUPPORTED` | The agent exists but cannot be dispatched as a subagent. |

The completion report records the agent that **actually** ran each task, and any
escalation. A tag, a config entry or frontmatter is not evidence that routing
happened; the harness's own session record is. How to check under each harness:
[opencode.md](opencode.md), [claude-code.md](claude-code.md).

## Example: OpenCode with Luna, Sol and Astra

`agentic-config.yml`:

```yaml
routing:
  roles:
    routine:        { agent: luna }
    implementation: { agent: sol }
    reasoning:      { agent: sol, escalate_to: astra }
  max_escalations: 1
```

Each name must be an OpenCode agent with `mode: subagent` or `mode: all`.
Provider, model and thinking budget live in that agent's definition. For example,
`.opencode/agents/luna.md`:

```markdown
---
description: Bounded lookups and mechanical work
mode: subagent
model: <provider_id>/<model_id>
---
```

Route `routine` to `luna`, not `luna-worker`. The names are your configuration,
not upstream defaults. Swapping Sol's model is an edit to `sol.md` alone; no
`tasks.md` changes.

## Migrating from 2.x / preset 1.x

1. **Existing `tasks.md` files keep working.** `@haiku`, `@sonnet` and `@opus`
   are read as `@routine`, `@implementation` and `@reasoning`. Do not rewrite
   historical feature documents.
2. **New tasks use the neutral tags.** `speckit.tasks` and
   `speckit.agentic.security` never emit legacy tags.
3. **Commands no longer set `model:`** in frontmatter. Under OpenCode, `model:
   opus` was passed through verbatim and is not a valid `provider/model` ID.
   Commands now run on the session's model. If you want a specific model for a
   command, set it in your harness, not in the shared template.
4. **Add the `routing:` block to your existing config.** Spec Kit does not
   overwrite an installed `agentic-config.yml` when the extension is updated, so
   an upgraded project has no `routing:` block until you add one. Until you do,
   every task runs inline, exactly as before. Copy the block from
   `.specify/extensions/agentic/config-template.yml` and delete the old
   `model_routing:` block. It was descriptive and never selected anything.
5. **Reinstall the preset** (`specify preset add --dev …`) so `plan`, `tasks`
   and `implement` pick up the new bodies.
6. **Preset without the extension:** `implement` reads the same config path. If
   the file is absent, everything runs inline.
