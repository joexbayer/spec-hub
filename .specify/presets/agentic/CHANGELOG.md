# Changelog

All notable changes to this preset are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [SemVer](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-10-13

Requires the routing config from the `agentic` extension 3.0.0 to route to named
agents. Without it, every task runs inline.

### Changed (breaking)

- `speckit.tasks` emits capability tags: `@routine`, `@implementation`,
  `@reasoning`. Legacy `@haiku` / `@sonnet` / `@opus` are read as aliases and are
  never emitted or rewritten.
- `speckit.implement` resolves each tag through `routing.roles` in
  `.specify/extensions/agentic/agentic-config.yml`. Before dispatch it runs a
  preflight that stops with `ROUTING_TAG_INVALID`, `ROUTING_AGENT_UNAVAILABLE` or
  `ROUTING_AGENT_UNSUPPORTED`, and it never substitutes an agent. Escalation goes
  only to the configured `escalate_to`, counted against the 3-retry budget. The
  completion report records which agent actually executed each task.
- `model: opus` removed from `plan`, `tasks` and `implement`.

## [1.1.0] - 2026-07-28

### Changed

- `speckit.tasks` — security controls are now first-class tasks: `SEC-*` prefix,
  placed in the same phase as the code they protect, with a concrete file path
  and one runnable check. Explicitly not a trailing security phase, which is the
  first thing dropped when a feature runs late.

## [1.0.0] - 2026-07-27

Initial release, built on Spec Kit v0.14.2 command bodies.

### Added

- **`speckit.plan`** — Phase 2 pre-task review producing `preview.md` with code
  sketches for the critical path, a Mermaid architecture diagram, and an explicit
  assumptions list. The command stops at the review and waits for approval.
- **`speckit.tasks`** — `@haiku`/`@sonnet`/`@opus` model tier tags,
  `[ctx: file:Lstart-Lend]` pre-fetched context annotations with a 30–150 line
  budget, `[deps: T###]` dependency lists, and `### Wave N` parallel grouping.
  Adds a task-sizing rule against one-shot overload.
- **`speckit.implement`** — wave-concurrent dispatch with commit gates between
  waves, model-tier routing, and orchestrator-side context injection with an
  `## Allowed Operations` allowlist and a `CONTEXT_INSUFFICIENT` escape hatch
  (one retry, then escalate). Retry budget capped at 3 per task.

### Preserved from upstream

Extension hook handling, handoffs, script contracts, and phase structure are
unchanged from v0.14.2.
