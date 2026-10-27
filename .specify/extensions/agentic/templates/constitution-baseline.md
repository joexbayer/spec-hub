# Constitution — Agentic Engineering baseline

Copy the rules you want into `.specify/memory/constitution.md`. This is a
starting rulebook, not a required one — the point of a constitution is that
**you** decide what it enforces, not a vendor.

Constitution rules are `BLOCKER`-level at verify. Only put something here that you
genuinely want to fail a merge. A rulebook nobody enforces trains everyone to
ignore it.

Rules earned from your own retrospectives — the ones that crossed the promotion
threshold in the known-failures registry — are worth more than anything below.
These are the defaults that stop the failures this methodology sees most often.

---

## Process

**P1. The plan is the contract.** Anything not in the plan is out of scope until
the plan is revised. Discovering mid-implementation that something else is needed
means stopping and revising, not proceeding.

**P2. No agent reviews its own work.** The verify gate is run by an agent that did
not write the implementation. A self-review is not a review.

**P3. Irreversible actions require explicit confirmation.** Migrations, deletions,
force-pushes, production deploys, and anything that destroys state stop and ask —
every time, regardless of how confident the plan is.

**P4. Never report unverified results.** If a test was not run, say it was not
run. If a background check has not returned, it has not returned. A predicted
result stated as an observed one is the most expensive error in this system.

## Decomposition

**D1. Tasks must be one-shottable.** A task whose done-condition cannot be stated
in one sentence is too large and gets split. Fewer than 5 tasks for substantial
work is a warning sign.

**D2. Subagents receive pre-fetched context, not paths.** The orchestrator reads
the ranges and inlines the contents. An agent told to go find its own context will
spend its budget rediscovering what the orchestrator already knew.

**D3. Scope is bounded by the allowlist.** A subagent that needs more returns
`CONTEXT_INSUFFICIENT` and is re-dispatched once. It does not widen its own scope.

## Restraint

**R1. No abstraction that was not requested.** A layer, package, or interface with
exactly one implementation is a finding, not a design.

**R2. No new dependency that an existing one, the standard library, or the
platform already covers.**

**R3. Safety is never cut for brevity.** Input validation at trust boundaries,
error handling that prevents data loss, security controls, and accessibility stay
in. Cut the abstraction, not the safety.

**R4. Deliberate shortcuts are marked.** A knowing corner-cut carries an
`agentic:debt` comment naming both the ceiling and the upgrade trigger. A shortcut
with no trigger is not a shortcut, it is a defect with good manners.

**R5. Fix root causes, not symptoms.** Before patching the path a bug report
names, check every caller of the function being touched.

## Security

**S1. Authorization is checked on every non-public endpoint**, at the server, on
every request. Client-side checks are UX, not access control.

**S2. Untrusted input is validated at the trust boundary** it crosses, not deeper
in. This includes anything retrieved at runtime — documents, webhooks, model
output.

**S3. Errors fail closed.** A control that cannot evaluate denies. Swallowed
exceptions and happy-path-only logic are OWASP A10, not style.

**S4. Security-relevant actions are logged and something alerts on them.** A log
nobody reads satisfies A09 on paper and nothing in practice.

**S5. Dependencies are pinned and scanned**, and the SBOM is regenerated on every
release rather than written once.

**S6. Secrets never enter the repo, the logs, or a prompt**, and can be rotated
without a deploy.

**S7. Security controls ship as tasks with tests**, in the same phase as the code
they protect — never as a follow-up phase.

## Quality

**Q1. Non-trivial logic leaves one runnable check** — the smallest thing that
fails if the logic breaks.

**Q2. Findings are anchored to line ranges.** An unanchored finding is a guess and
does not get reported.

**Q3. Stage specific files.** Never `git add .` — it commits whatever else happens
to be in the tree.

---

## Project-specific rules

<!-- Add your own below. Rules promoted from the known-failures registry go here,
     with the failure count and the date they crossed the threshold. -->

| Rule | Source | Promoted |
|------|--------|----------|
|      |        |          |
