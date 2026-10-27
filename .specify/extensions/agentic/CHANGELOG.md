# Changelog

All notable changes to this extension are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [SemVer](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-10-13

Provider- and harness-neutral agent routing. Migration: [docs/routing.md](docs/routing.md#migrating-from-2x--preset-1x).

### Changed (breaking)

- Removed `model:` from every command's frontmatter. Spec Kit passed it through
  verbatim, and under OpenCode `model: opus` is not a valid `provider/model` ID.
  Commands now run on the session's model.
- `model_routing:` in `agentic-config.yml` is replaced by `routing:`. That block
  maps the capability roles `routine`, `implementation` and `reasoning` to
  harness agent profile names, with an optional per-role `escalate_to` and
  `max_escalations`. Every role ships empty, which means it runs inline.
- `security` now tags new tasks `@routine` / `@implementation` / `@reasoning`.
  Legacy `@haiku` / `@sonnet` / `@opus` remain readable aliases.

### Added

- `docs/routing.md`: the routing model, preflight errors, an OpenCode example
  and the migration guide.
- `docs/opencode.md`: agent locations, the `subagent`/`all` mode requirement,
  dispatch, and how to confirm which agent actually ran.
- `verify` dispatches reviewers to the configured `@reasoning` agent, never the
  session or subagent that implemented the change.

### Unchanged

- An existing `agentic-config.yml` is never overwritten on update. Add the
  `routing:` block by hand; until then, everything runs inline as before.

## [2.1.0] - 2026-07-28

### Added

- `speckit.agentic.security` — derives security requirements for a feature from
  the baseline and appends them to `tasks.md` as tagged `SEC-*` tasks, placed in
  the same phase as the code they protect. Establishes trust boundaries first,
  then walks the Top 10, then the applicable regimes. Wired to the `after_tasks`
  hook as an optional prompt.
- `templates/security-baseline.md` — the shared reference: **OWASP Top 10:2025**
  (current as of Jan 2026, including the new A03 Software Supply Chain Failures
  and A10 Mishandling of Exceptional Conditions), ASVS 5.0 levels, agentic-system
  risks, CRA / NIS2 / NSM / GDPR obligations, and a non-negotiable control floor.
- Seven security rules in the constitution baseline.
- `security.asvs_level`, `security.owasp_review`, `security.regimes` and
  `security.baseline` configuration.

### Changed

- `verify` dimension 3 rewritten against the Top 10:2025 rather than generic
  categories, with explicit prompts for A03 and A10 (both new, both routinely
  missed by reviews carrying the 2021 list forward), an agentic-system check, and
  a cross-check of `SEC-*` tasks against the diff — a checked-off `SEC-` task with
  no control in the code is a BLOCKER.
- `restraint` now treats the baseline's control floor as overriding any necessity
  finding: flag a suspicious-looking control as a question, never cut it.

## [2.0.0] - 2026-07-27

### Added

- `speckit.agentic.restraint` — the decision ladder as a gate before code is
  written, with the "understand the problem first" guard, root-cause-not-symptom
  bug handling, the never-cut safety floor, the one-runnable-check rule, and a
  `lite`/`full`/`ultra` intensity dial.
- `speckit.agentic.audit` — whole-repository over-engineering sweep with tagged
  findings (`delete`/`stdlib`/`native`/`yagni`/`shrink`).
- `speckit.agentic.debt` — harvests `agentic:debt` markers into a ledger and
  flags any shortcut whose comment names no upgrade trigger.
- `roles/` — prompt contracts for orchestrator, worker, explorer, and reviewer,
  encoding the manager→worker structure that was previously only implied.
- `docs/claude-code.md` — harness integration: subagents, parallel fan-out,
  worktree isolation, background execution, loop-until-dry, and hooks.
- `templates/constitution-baseline.md` — a starting rulebook so the promotion
  machinery has somewhere to promote into.
- `after_plan` hook offering the restraint gate.
- `restraint.intensity` and `verify.dry_rounds` / `verify.refutation_votes`
  configuration.

### Changed

- `verify` gains two dimensions — **necessity** (unrequested abstraction as a
  defect, `BLOCKER` under `ultra`) and **velocity illusions** (NOTE-level
  hygiene signals) — plus a hunting protocol that loops until two consecutive
  rounds come back empty, and an adversarial pass that tries to refute each
  finding before reporting it.
- `retrospective` folds in the debt ledger and seeds the constitution from the
  baseline when the project has none.
- `quickfix` checks the ladder before editing and fixes root causes rather than
  the reported path.

### Credits

Restraint concepts adapted from [ponytail](https://github.com/DietrichGebert/ponytail)
by Dietrich Gebert.

## [1.0.0] - 2026-07-27

### Added

- `speckit.agentic.verify` — adversarial review gate across five dimensions
  (spec divergence, missing tasks, security, correctness, contract breaks) with
  a `PASS` / `PASS-WITH-WARNINGS` / `FAIL` verdict and an evidence rule requiring
  every finding to be anchored to a line range.
- `speckit.agentic.retrospective` — post-mortem producing
  `CONSTITUTION_AMENDMENTS` and `SKILLS_TO_EXTRACT`, and maintaining the
  known-failures registry with a configurable promotion threshold.
- `speckit.agentic.skills` — promotes retrospective skill candidates into skill
  files, skipping candidates without concrete triggers and steps.
- `speckit.agentic.quickfix` — guarded fast lane for changes of ≤2 files and
  ≤20 lines, with protected-path globs and mid-flight escalation triggers.
- `after_implement` hook offering the verify gate on every run.
- Configuration template covering quickfix guards, model routing tiers, and the
  promotion threshold.
- Templates for the retrospective document and the known-failures registry.
