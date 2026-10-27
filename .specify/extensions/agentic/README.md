# Agentic Engineering — a Spec Kit extension

Adds the **compounding layer** around the core [Spec Kit](https://github.com/github/spec-kit)
pipeline: a restraint gate before code is written, an independent adversarial
review after it, a retrospective that turns each run's lessons into enforced
rules, and a guarded fast lane for changes too small to justify the full pipeline.

Core Spec Kit takes you from an idea to an implementation. This extension is
about what happens on either side of that: stopping work that shouldn't be built,
keeping the rest honest on the way out, and making the next run cheaper than this
one.

> Specs are the source of truth. Code is a build artifact of the spec.

## Where it fits

```
specify → clarify → plan → [restraint] → tasks → implement → [verify] → retrospective → skills
                                            └── quickfix bypasses all of it ──┘
```

Everything between `specify` and `implement` is core Spec Kit. The bracketed gates
are this extension, wired to `after_plan` and `after_implement` as optional
prompts — offered every run, forced on none.

## Commands

| Command | Suits | What it does |
|---|---|---|
| `/speckit.agentic.restraint` | `@reasoning` | The decision ladder. Rules out the cheap answers — reuse, stdlib, platform, existing dep, one-liner — before any construct is written. Flags single-caller abstractions. |
| `/speckit.agentic.verify` | `@reasoning` | Adversarial review across seven dimensions: spec divergence, missing tasks, security, correctness, contract breaks, necessity, velocity illusions. Hunts until convergence, refutes before reporting. |
| `/speckit.agentic.retrospective` | `@implementation` | Post-mortem producing `CONSTITUTION_AMENDMENTS` and `SKILLS_TO_EXTRACT`, maintaining the known-failures registry and folding in the debt ledger. |
| `/speckit.agentic.skills` | `@implementation` | Promotes skill candidates from the latest retrospective into skill files. |
| `/speckit.agentic.security` | `@reasoning` | Derives security requirements for the feature from the baseline (OWASP Top 10:2025, ASVS level, any regime that applies) and appends them to `tasks.md` as tagged `SEC-*` tasks. Runs *before* implementation. |
| `/speckit.agentic.audit` | `@reasoning` | Whole-repo sweep for over-engineering — what can be deleted, tagged `delete`/`stdlib`/`native`/`yagni`/`shrink`. |
| `/speckit.agentic.debt` | `@routine` | Harvests `agentic:debt` markers into a ledger, flagging any shortcut with no upgrade trigger. |
| `/speckit.agentic.quickfix` | `@implementation` | Fast lane for ≤2 files / ≤20 lines with no new dependencies. Rejects and escalates when the change is bigger than it looked. |

## Roles

`roles/` holds prompt contracts for the agents this workflow dispatches —
[orchestrator](roles/orchestrator.md), [worker](roles/worker.md),
[explorer](roles/explorer.md), [reviewer](roles/reviewer.md). The structure is
manager → worker, not pairing.

Without a written contract, every dispatch re-improvises its framing and the
guarantees drift. Prepend the role file to the subagent's prompt, then the
task-specific content.

## Harnesses

[`docs/routing.md`](docs/routing.md) covers the shared routing config and
migration from the legacy Haiku/Sonnet/Opus tags. [`docs/opencode.md`](docs/opencode.md)
covers agent definitions, subagent modes and dispatch under OpenCode.
[`docs/claude-code.md`](docs/claude-code.md) maps the harness onto the workflow:
subagents for the role contracts, parallel fan-out for waves and the verify hunt,
worktree isolation for parallel writers, background execution for slow gates,
loop-until-dry for convergence, and hooks for the things a prompt cannot
guarantee.

All of it is optional — every command degrades to a single-agent sequential pass.

## Install

```bash
specify extension catalog add \
  <agentic-extension-repo-raw-url>/extensions/catalog.json \
  --name agentic --install-allowed
specify extension add agentic
specify extension list
```

Or from a local clone:

```bash
git clone <agentic-extension-repo-url>
specify extension add --dev agentic-extension/extensions/agentic
```

Verify they registered:

```bash
specify extension list
ls .claude/skills/speckit-agentic-*     # Claude (skills mode)
ls .claude/commands/speckit.agentic.*   # slash-command agents
```

> **Command spelling depends on your agent.** Slash-command agents get
> `/speckit.agentic.verify`; skills-based agents (Claude, Codex, Kimi) get
> `/speckit-agentic-verify`. Same command — the separator is chosen by the
> integration. Under Claude these install to
> `.claude/skills/speckit-agentic-<name>/SKILL.md`.

## Configuration

Optional. Installed to `.specify/extensions/agentic/agentic-config.yml`; the
commands fall back to sane defaults when it is absent.

```yaml
quickfix:
  protected_globs: ["**/migrations/**", "**/auth/**", "**/*.sql", ...]
  max_files: 2
  max_lines_changed: 20

restraint:
  intensity: "full"   # lite | full | ultra

verify:
  dry_rounds: 2       # empty rounds before the hunt converges
  refutation_votes: 3 # independent attempts to kill each finding

promotion:
  threshold: 3        # recurrences before a failure becomes a constitution rule

paths:
  retrospectives: "docs/retrospectives"
  skills: "skills/extracted"
  known_failures: ".specify/memory/known-failures.md"
```

Two knobs worth tuning first.

`protected_globs` — the quickfix lane earns its speed by being narrow, and the
glob list is what keeps it that way. Migrations, auth, and schema files should
never take the express route.

`restraint.intensity` — a dial, not a switch. `lite` nudges, `full` enforces the
ladder on every new construct, `ultra` requires every new file, dependency and
layer to be justified in writing and turns necessity findings into blockers at
verify. Prototypes tolerate more; load-bearing production code less.

## The ideas behind it

**Trust but verify.** Hallucinations don't announce themselves; plausible-but-wrong
code passes superficial checks. An independent reviewer costs roughly a tenth of
a re-implementation. The agent that wrote the code never reviews it — framing the
reviewer to *find what's missing* rather than confirm what exists is the whole
trick.

**The compounding layer.** A retrospective that produces no artifact is just
reflection. This one produces two: amendments that become constitution rules
after a pattern recurs three times, and skills that get loaded on the next run.
The three-count threshold is deliberate — it filters real patterns from noise.
It's the stage most likely to be skipped under pressure and the one with the
highest long-term leverage.

**Capability routing.** Tasks say what they need — `@routine`,
`@implementation`, `@reasoning` — and `routing.roles` in `agentic-config.yml`
maps each to an agent your harness defines. Provider, model and thinking budget
stay in the harness, so none of them appear in tasks or commands. Missing agents
fail loudly; nothing is silently substituted. The "Suits" column above is a hint
for which session to run a command in, not a setting. See
[docs/routing.md](docs/routing.md).

**Restraint.** An agent's default failure mode is not laziness, it is eagerness.
Ask for a config loader, get a plugin system. The ladder runs *after* you
understand the problem — a small diff you don't understand is laziness dressed up
as efficiency — and stops at the first rung that answers the need. Restraint is
about necessity, not brevity: cut the abstraction, never the safety.

Written up in full at [wiki.joexbayer.dev/wiki/agentic-engineering](https://wiki.joexbayer.dev/wiki/agentic-engineering).

## Layout

```
extension.yml                          manifest
config-template.yml                    installed as agentic-config.yml
commands/{restraint,security,verify,retrospective,skills,audit,debt,quickfix}.md
roles/{orchestrator,worker,explorer,reviewer}.md
templates/{retrospective,known-failures,constitution-baseline,security-baseline}*.md
docs/{routing,opencode,claude-code}.md
```

## Credits

The decision ladder, the never-cut safety floor, the intensity dial, the
`agentic:debt` marker convention and the tagged over-engineering findings are
adapted from **[ponytail](https://github.com/DietrichGebert/ponytail)** by
Dietrich Gebert, an agent skill that applies YAGNI before code generation.

## Further reading

The methodology this implements is documented on the wiki:

| Article | Covers |
|---|---|
| [Agentic Engineering](https://wiki.joexbayer.dev/wiki/agentic-engineering) | The overall method and why it exists |
| [Installing and Running the Toolkit](https://wiki.joexbayer.dev/wiki/installing-and-running-the-toolkit) | Install, command surface, configuration |
| [Trust but Verify](https://wiki.joexbayer.dev/wiki/trust-but-verify) | The verify gate — dimensions, loop-until-dry, refutation |
| [The Restraint Principle](https://wiki.joexbayer.dev/wiki/the-restraint-principle-yagni-for-agents) | The decision ladder and the safety floor |
| [The Compounding Layer](https://wiki.joexbayer.dev/wiki/the-compounding-layer) | Retrospectives, known-failures, debt ledger, skills |
| [Spec-Driven Workflow](https://wiki.joexbayer.dev/wiki/spec-driven-workflow) | The full pipeline, phase by phase |

## Requirements

Spec Kit `>=0.14.0`. No external tools.

## License

MIT
