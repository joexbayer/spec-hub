# Roles

Reusable prompt contracts for the agents this workflow dispatches. Installed to
`.specify/extensions/agentic/roles/`.

The methodology is **manager → worker**, not pairing. You direct an orchestrator;
the orchestrator dispatches bounded, well-specified work to cheaper agents that
report back. That structure is deliberately waterfall — it exists to stop
oversized, under-specified work from being handed to a single agent that will
silently drop half of it.

Without a role contract, every dispatch re-improvises its own framing and the
guarantees drift. These files are the framing, written once.

| Role | Capability | Dispatched for | Key constraint |
|---|---|---|---|
| [orchestrator](orchestrator.md) | `@reasoning` (main session) | Holds the plan, splits work, injects context | Never implements what it can dispatch |
| [worker](worker.md) | `@implementation` | A single specified task | Cannot read outside its allowlist |
| [explorer](explorer.md) | `@routine` | Lookups, greps, listings | Read-only; reports, never edits |
| [reviewer](reviewer.md) | `@reasoning` | Independent review of finished work | Never reviews its own output |

Which agent plays each capability is set in `routing.roles` in
`agentic-config.yml` — see [../docs/routing.md](../docs/routing.md). The role
contract is the framing; the configured agent is who receives it.

## How to use them

Prepend the role file to the subagent's prompt, then append the task-specific
content. For a worker that means the role contract, then `## Pre-Fetched Context`,
then `## Allowed Operations`, then the task description.

The orchestrator does the pre-fetching. Handing a worker a list of paths instead
of the contents defeats the point — see [worker.md](worker.md).

## Why the reviewer is separate

The agent that wrote the code is the worst possible reviewer of it: it shares
every assumption that produced the bug. Independence is the whole mechanism, and
it is structural, not a matter of instructions. A reviewer that saw the
implementation being written is not independent, regardless of what its prompt
says.
