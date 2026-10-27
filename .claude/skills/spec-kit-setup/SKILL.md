---
name: spec-kit-setup
description: How Spec Kit is installed and wired in this repo (specify 1.1.0, agentic extension and preset from a local checkout of the extension source), and how to re-run or update it. Use when re-initializing Spec Kit, updating the agentic extension or preset, adding or checking Spec Kit hooks in .specify/extensions.yml, wondering why /speckit-specify created no git branch, or comparing this repo's Spec Kit setup with the pilot's.
---

# Spec Kit setup in this repo

Set up on 2026-10-26 with `specify` 1.1.0 (`specify --version`).

## Re-create from scratch

```sh
specify init --here --force --integration claude --script sh --non-interactive
specify extension add --dev <agentic-extension-source>/extensions/agentic
specify preset add --dev <agentic-extension-source>/presets/agentic
```

- `--force` is required even when the only thing in the directory is `.git`. Without it,
  non-interactive init stops with "Current directory is not empty".
- Without `--integration claude`, non-interactive init defaults to Copilot.
- `--dev` installs from a local directory. The published catalog
  (the extension repository's `extensions/catalog.json`) lagged behind
  the local clone. On 2026-10-26 the catalog had extension 2.1.0, the clone had extension 3.0.0 and
  preset 2.0.0 (one commit not yet pushed), and the pilot had 2.2.0.
- To update, re-run the same command with `--force` (extension) or use `specify preset update`.

## Things that differ from older Spec Kit and from the pilot

- **`/speckit-specify` creates no git branch.** In 1.1.0, branch creation is a `before_specify` hook
  from the optional `git` extension, and it isn't installed here. The command only creates
  `specs/NNN-name/` and writes `.specify/feature.json`.
- **Hooks wired by the agentic extension** (`.specify/extensions.yml`): `after_plan` → restraint,
  `after_tasks` → security, `after_implement` → verify. All are `optional: true`, so they prompt and
  never run on their own.
- The pilot's 2.2.0 also wires `before_plan` → priorart and `after_converge` → asbuilt. Neither
  command exists in extension 3.0.0, so they are not wired here.
- `feature_numbering` is `sequential` (`.specify/init-options.json`).

## Constitution

`.specify/memory/constitution.md` is authoritative. Rules carry `[ci]`, `[review]` or `[parked]`
(see its "Rule States" section). Amend it with `/speckit-constitution` and bump the version. Remove
the Sync Impact Report comment at the top before committing.
