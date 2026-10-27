# Claude Code harness integration

The commands in this extension are written to be agent-agnostic — they describe
protocols in prose so they work under any agent Spec Kit supports. This document
covers the extra leverage available when the agent is **Claude Code**, and which
part of the workflow each capability serves.

Nothing here is required. Every command degrades to a single-agent sequential
pass when these surfaces are unavailable.

> Feature availability varies by Claude Code version and by what the user has
> enabled. Treat anything below as "use if present", never as a hard dependency —
> a command that fails because a harness feature is missing is a broken command.

---

## Subagents → the role contracts

Claude Code can dispatch subagents with their own fresh context window. This is
the mechanism the [roles](../roles/README.md) describe:

- **Fresh context** — a subagent is not carrying the orchestrator's history, so
  its attention is not diluted by everything that came before.
- **Parallelism** — independent tasks run concurrently; total time is the slowest
  task, not the sum.
- **Independence** — a reviewer dispatched as a separate agent genuinely did not
  write the code, which is what makes `verify` worth running.

### Routing to named agents

`routing.roles.<role>.agent` in `agentic-config.yml` names a Claude Code
subagent: either a file at `.claude/agents/<name>.md` (project) or
`~/.claude/agents/<name>.md` (user), or a built-in subagent type that the
dispatch tool lists. The model goes in that agent's own frontmatter, not in this
workflow. See [routing.md](routing.md).

- **Preflight.** If the name is neither a file in those locations nor in the
  dispatch tool's list of agent types, `implement` stops with
  `ROUTING_AGENT_UNAVAILABLE`. Every defined Claude Code subagent can be
  dispatched, so `ROUTING_AGENT_UNSUPPORTED` applies only when the harness
  refuses the dispatch.
- **Dispatch** with the subagent tool, `subagent_type` set to the configured
  name exactly.
- **Record** the agent type the dispatch actually used, not the one the tag
  implied.

A role left empty runs in the main thread.

**Send independent dispatches in a single message** so they actually run
concurrently rather than serially.

### Context injection still applies

A subagent with its own context window will happily spend it re-reading the
codebase. The `[ctx: ...]` protocol exists precisely because fresh context is not
the same as free context. Pre-fetch and inline; do not hand down paths.

---

## Parallel fan-out → waves and the verify hunt

Two places in this workflow are natural fan-outs:

**Implementation waves.** Tasks grouped under a `### Wave N (parallel)` header are
independent by construction. Dispatch them together, then commit before the next
wave so it reads a settled tree.

**Verify dimensions.** The seven review dimensions are seven different searches
over the same diff. Running them concurrently, each in its own context, surfaces
more than one reviewer sweeping for everything at once — that reviewer's attention
gets spread across dimensions and finds the obvious problem in each.

For orchestration that needs to be deterministic — a fixed fan-out, a loop with a
real termination condition, a set of stages — prefer a scripted workflow over
asking a model to remember to do it. Model-driven orchestration drifts; scripted
control flow does not.

---

## Worktree isolation → parallel writers

When several agents write to the tree at once, they conflict. Claude Code can run
a subagent in its own git worktree, giving it an isolated copy of the repo.

Use it when a wave has **multiple tasks that write**, not when the wave is mostly
reads. Isolation costs setup time and disk per agent, so a parallel group of
explorers should never pay for it.

Merge order after an isolated wave is the orchestrator's problem, not the
workers' — collect the results, then integrate.

---

## Background execution → long-running gates

Test suites, builds, and full-repo audits can run in the background while the
orchestrator continues. Two rules:

1. **Do not poll.** If the harness notifies on completion, wait for the
   notification. A polling loop burns turns to learn nothing.
2. **Never report a background result before it arrives.** A pending check is
   pending. Writing what you expect it to say is the single most damaging thing
   an orchestrator can do at a verification gate.

The `audit` command over a large repository is a good candidate. So is a slow test
suite behind `quickfix`'s verify step — though if the suite is that slow, the
change probably is not a quickfix.

---

## Loops → convergence instead of counting

`verify` uses **loop-until-dry**: keep hunting until two consecutive rounds
surface nothing new. That is a convergence condition, and it is strictly better
than "find N problems" — a fixed count either stops early and misses the tail, or
pads the list to reach its target.

The same shape applies to `audit` on a large tree: sweep, dedupe against
everything already seen, sweep again, stop when a round comes back empty.

**Deduplicate against every finding seen, including refuted ones.** Deduping only
against confirmed findings means a rejected candidate reappears each round and
the loop never terminates.

For recurring work on a schedule — a nightly audit, a debt-ledger sweep before
each release — Claude Code's scheduling surfaces can drive the command directly.
That is a genuine use for a loop; polling a job you just started is not.

---

## Hooks → automation the model cannot forget

An instruction in a prompt is a request. A hook is a guarantee.

Two layers exist and they are unrelated:

**Spec Kit extension hooks** (`.specify/extensions.yml`) fire around pipeline
stages. This extension registers two:

| Event | Command | Mode |
|---|---|---|
| `after_plan` | `speckit.agentic.restraint` | optional, prompts |
| `after_implement` | `speckit.agentic.verify` | optional, prompts |

Both are optional by design. A gate that fires without asking gets resented and
then disabled; one that offers itself gets used.

**Claude Code hooks** (`.claude/settings.json`) fire around tool calls and session
events, and the harness runs them rather than the model. That makes them the right
place for anything that must happen every time regardless of what the model
decides — running a formatter after edits, blocking writes to protected paths,
enforcing the `quickfix.protected_globs` list at the tool layer rather than
trusting the command to check.

If you find yourself writing "always remember to X" into a prompt, X wants to be a
hook.

---

## Skills → what the compounding layer produces

`speckit.agentic.skills` writes skill files from retrospective candidates. Under
Claude Code those become loadable skills, which closes the loop: a pattern
extracted after run 3 is available to the agent on run 4 without anyone
remembering to paste it.

Two things make a skill actually fire:

- **The description decides when it loads.** Write it about *when to use this*,
  keyword-rich and specific, not about what it contains.
- **Reference source files by path and line range** instead of copying code into
  the skill. Copies go stale silently; references break loudly.

### How this extension lands under Claude

Spec Kit registers extension content as **skills** for Claude, one directory per
command, with a hyphen separator rather than dots:

```
.claude/skills/speckit-agentic-verify/SKILL.md
.claude/skills/speckit-agentic-restraint/SKILL.md
...
```

So you invoke `/speckit-agentic-verify`, not `/speckit.agentic.verify`. Same
command; the separator is chosen by the integration.

Cross-command references resolve correctly in that path. Verified on
`0.14.3.dev0`: `__SPECKIT_COMMAND_AGENTIC_RETROSPECTIVE__` in a command body
renders as `/speckit-agentic-retrospective` in the installed skill. Upstream
documentation warns that tokens leak literally in skills mode — that was true of
an earlier version and is not true here. Use the tokens; hard-coding either
separator breaks the other set of agents.

---

## What not to do

- **Do not parallelize dependent work.** Two tasks touching the same file are
  sequential regardless of what the wave header says.
- **Do not spawn agents to look busy.** A fan-out that costs more than it saves is
  the illusion of speed with extra steps.
- **Do not let a subagent widen its own scope.** `CONTEXT_INSUFFICIENT` and one
  orchestrator retry, then escalate.
- **Do not silently cap coverage.** If a sweep looked at the top 20 files of 400,
  say so. Silent truncation reads as "covered everything".
