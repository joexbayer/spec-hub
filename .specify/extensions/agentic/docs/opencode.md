# OpenCode harness integration

Harness-specific notes for running this workflow under
[OpenCode](https://opencode.ai). The workflow itself lives in the commands and
in [routing.md](routing.md). This page covers only how OpenCode exposes agents.

## Install

```bash
specify init my-project --integration opencode
specify extension add agentic
specify preset add --dev agentic-extension/presets/agentic
```

Commands land in `.opencode/commands/speckit.*.md`. None of them set `model:`,
so each one runs on the session's model.

## Defining the routed agents

`routing.roles.<role>.agent` names an OpenCode agent. OpenCode resolves agents
from:

- `.opencode/agents/<name>.md` (project) or `~/.config/opencode/agents/<name>.md` (global)
- the `agent.<name>` key in `opencode.json` / `opencode.jsonc` (project or global)
- built-ins such as `general` and `explore`

Provider, model and thinking budget belong in that definition. Model IDs are
`provider_id/model_id`; there are no aliases. The workflow never needs to know
these values.

## Preflight: exists and can run as a subagent

`implement` checks each configured agent before dispatching anything. Under
OpenCode that check means:

1. **Exists.** `opencode agent list` prints every resolved agent with its mode.
   If you cannot run it, look in the locations above. Not found →
   `ROUTING_AGENT_UNAVAILABLE`.
2. **Dispatchable.** The mode must be `subagent` or `all`; an agent with no
   `mode` defaults to `all`. A `mode: primary` agent cannot be reached by the
   `task` tool, and neither can one with `disable: true`. Either case →
   `ROUTING_AGENT_UNSUPPORTED`.

This check is the reason to route `routine` to an agent whose mode supports
subagent dispatch, rather than to a similarly named primary-only profile.

## Dispatch

Dispatch through the `task` tool with `subagent_type` set to the configured name,
exactly. Send all tasks in a wave in one turn so they run concurrently.

Do not test routing with `opencode run --agent <name>`. When the named agent is
`mode: subagent`, it silently falls back to the default agent.

## Confirming what actually ran

Each subagent gets its **own session id**. Its messages are recorded under that
session, not the parent's, with the agent name on each message. The `task` tool
result identifies the session. Report from that; if you can't see it, write
`unconfirmed`. A query filtered on the parent session id shows no subagent work
and misleads.

## Naming caveat

In an OpenCode prompt, `@name` mentions a subagent. Command bodies contain the
literal text `@routine`, `@implementation` and `@reasoning`. Don't give agents
those names, or the command text can invoke them.
