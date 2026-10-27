---
name: speckit-agentic-quickfix
description: Fast-track lane for small, low-risk changes — bypasses specify/plan/tasks for a direct describe → patch → verify → commit path.
compatibility: Requires spec-kit project structure with .specify/ directory
metadata:
  author: joexbayer
  source: agentic:commands/quickfix.md
---

## User Input

```text
$ARGUMENTS
```

## Purpose

The full pipeline is overkill for trivial work: typo fixes, one-line bugs, dead
code removal, comment and formatting tweaks. This is the express lane.

You are NOT writing a spec, a plan, or tasks. You ARE making a small, targeted
edit and confirming it still works.

The lane earns its speed by being narrow. The preconditions below are the whole
point — an unguarded fast lane is just the pipeline with the review removed.

## Configuration

Read `.specify/extensions/agentic/agentic-config.yml` for `quickfix.max_files`,
`quickfix.max_lines_changed`, `quickfix.allowed_commit_types`, and
`quickfix.protected_globs`.

If the file is missing, use these defaults:

- `max_files: 2`
- `max_lines_changed: 20`
- `allowed_commit_types: [fix, docs, style, chore, typo, refactor]`
- `protected_globs: ["**/migrations/**", "**/auth/**", "**/security/**", "**/*.sql", "**/api/**/route.*", "**/.env*", "**/Dockerfile", "**/*.yml", "**/*.yaml"]`

## Hard Preconditions

Check every one before doing any work:

1. Files touched ≤ `max_files`
2. Lines changed ≤ `max_lines_changed`
3. No new files
4. No new dependencies — no edits to `package.json`, `Cargo.toml`,
   `requirements.txt`, `go.mod`, `pyproject.toml`, or a lockfile
5. No public API change — no exported signature changes, no schema changes
6. Commit type is in `allowed_commit_types` (`refactor` only when mechanical and
   behaviour-preserving)
7. No path matches `protected_globs`

If ANY precondition fails, STOP without editing and emit:

```
QUICKFIX REJECTED: <precondition that failed, and the actual value>
Recommendation: run /speckit-specify for the full pipeline.
```

Rejecting is a normal outcome, not a failure. Do not negotiate the limits down
to fit the change, and do not split one change across several quickfix runs to
stay under them.

## Pipeline

1. **Describe** — one sentence restating what is being fixed.
2. **Patch** — locate the file(s) and make the minimal edit. Locating is a
   mechanical read (`@routine`); the edit is well-specified work
   (`@implementation`). Quickfix normally runs both in this session; if you
   dispatch either, use the agent `routing.roles` names for that capability.
   Change only what the description covers.

   Before writing anything: does the codebase, the standard library, or an
   already-installed dependency solve this? A quickfix that adds a helper has
   stopped being a quickfix. If this is a bug, grep every caller of the function
   you are touching — one guard in the shared function is a smaller diff than one
   per call site, and patching only the reported path leaves the siblings broken.
3. **Verify** — run the project's test command (check `package.json`, `Makefile`,
   `pyproject.toml` — typically `npm test`, `pytest`, `go test ./...`,
   `cargo test`). If there are no tests, run the type checker, linter, or build.
   Report the real result; never assume a pass.
4. **Commit** — stage the specific files changed and write a conventional commit
   message: `<type>: <short description>`. Do not stage unrelated files.

## Escalation Triggers

Abandon the lane and escalate immediately if:

- Scope grows past `max_files` mid-edit
- Tests fail twice in a row after attempted fixes
- The edit reveals the change is a feature, not a fix
- The change turns out to need `feat:` or a non-mechanical `refactor:`
- You discover unrelated bugs in the touched area

On escalation, emit and stop:

```
QUICKFIX → FULL PIPELINE
Reason: <trigger>
Next: /speckit-specify
```

Leave the working tree in a state the user can inspect. Do not commit a partial
escalated change.

## Output

On success:

```
QUICKFIX COMPLETE
Files: <list>
Lines changed: <count>
Tests: <command run → pass/fail>
Commit: <hash> <message>
```

No verify gate, no retrospective, no skill extraction. The change is small
enough that the commit message is the documentation.