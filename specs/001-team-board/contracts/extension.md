# Contract: the `spec-hub` Spec Kit extension and its reporter

## Files in the extension (`packages/extension/`, installed as `.specify/extensions/spec-hub/`)

```text
extension.yml          # id: spec-hub; provides.scripts: [spec-hub]; provides.config: [spec-hub-config.yml]
config-template.yml    # scaffolded once to .specify/extensions/spec-hub/spec-hub-config.yml
scripts/spec-hub       # POSIX sh, needs only git and curl
README.md
```

## Repository link setting (committed, FR-028)

`.specify/extensions/spec-hub/spec-hub-config.yml`, flat `key: value` lines only:

```yaml
hub_url: https://spec-hub.example.com
project: pilot
remote: origin            # optional, default origin
```

## Per-clone and per-person state (never in the repository)

| Where | What |
|---|---|
| `git config --local spec-hub.cloneId` | A uuid set by `connect`. |
| `git config --local --get-all spec-hub.private` | Private branch prefixes (FR-009). |
| `${XDG_CONFIG_HOME:-~/.config}/spec-hub/credentials` | Lines of `<hub_url> <token>`, file mode 600, shared by all clones. |
| `$(git rev-parse --git-common-dir)/spec-hub/` | `spec-hub` (the copy of the reporter that clone-managed hooks run, mode 700), `last-ok` (time of the last stored report), `error` (the last reason the developer must act on: 401/403/404, a clone id registered elsewhere, or a missing `<remote>/<default>`), `error-shown` (the date the notice was last printed), `lock` and `pending` (one background report at a time). |

## Commands

| Command | Behaviour |
|---|---|
| `spec-hub connect` | Checks `hub_url` (`https://`, or `http://` only for `localhost`, `127.0.0.1` and `[::1]`; no `@` user info) and `project` (`^[a-z0-9][a-z0-9-]{1,62}$`). Asks for the token on a hidden prompt that names the destination (`Paste your Spec Hub token for <scheme>://<host[:port]>: `), unless the credentials file already holds one for this hub. Then: (1) stores it with mode 600; (2) sets `spec-hub.cloneId`; (3) installs or checks hooks (below); (4) runs one report in the foreground and prints `Connected to <project> as @<login>: <n> features in flight.` The whole command is the one enabling step per clone (FR-008). |
| `spec-hub disconnect` | Removes the hook files it wrote, the `spec-hub.*` git config keys and the `spec-hub/` state directory (with the hooks' copy of the reporter). It leaves the credentials file, which other clones use. The repository is as it was (FR-008). |
| `spec-hub status` | Prints the hub, project, hooks mode and whether hooks are active, the private prefixes, the last successful report and the last error (FR-007). |
| `spec-hub private add <prefix>` / `private remove <prefix>` | Manages `spec-hub.private`. |
| `spec-hub hooks <dir>` | For team-managed hooks: in `<dir>` (for example `.githooks`), creates or appends the four hook files with the call line. Meant to be committed once by the team. |
| `spec-hub report` | Runs one report in the foreground and prints the result. For debugging and for worktrees that have no hooks. |
| `spec-hub hook <event>` | Called by the hook line only. If the clone isn't connected, it does nothing. Otherwise it prints the pending notice (at most once a day), starts `report` in the background with all output discarded, and exits 0. |

## The hook lines

The line goes in all four hooks (`post-commit`, `post-checkout`, `post-merge`, `post-rewrite`);
the event name changes per file. It never fails the hook, so it is safe in hooks that run under
`set -euo pipefail` (the pilot's do).

**Clone-managed hooks** (`core.hooksPath` unset):
- `connect` copies the reporter it was run as to `<common-dir>/spec-hub/spec-hub` (mode 700;
  `<common-dir>` is `git rev-parse --path-format=absolute --git-common-dir`) and writes
  `#!/bin/sh`, a `# spec-hub` marker line and this line to `<common-dir>/hooks/<event>`:

  ```sh
  [ -x '<common-dir>/spec-hub/spec-hub' ] && sh '<common-dir>/spec-hub/spec-hub' hook post-commit || true
  ```

  The hooks never run the work tree's script, so checking out a branch that changes it runs
  nothing from that branch. The background report runs the same copy. Running `connect` again
  refreshes the copy and rewrites the marked hook files: do that after upgrading the extension or
  moving the repository. Until then `status` shows the hooks as missing (moved repository) or the copy as
  outdated (upgraded extension), and a report the hub refuses is recorded for the daily notice.
- An existing file without the marker is left alone. `connect` prints the line to add to it.

**Team-managed hooks** (`core.hooksPath` set, typically a tracked directory):
- The team adds this line with `spec-hub hooks <dir>` and commits it:

  ```sh
  [ -f .specify/extensions/spec-hub/scripts/spec-hub ] && sh .specify/extensions/spec-hub/scripts/spec-hub hook post-commit || true
  ```

- `connect` checks that the line is present in `<hooksPath>/<event>` and reports any hooks that are
  missing.
- Trade-off: this line runs the script from the checked-out branch, like every committed hook a
  team keeps in the repository. A branch that changes the script runs its own version on checkout,
  so the team reviews changes to it as it reviews hook changes. `spec-hub hooks` prints this note.

## The background report

`hook` starts `report` detached. One report runs per clone at a time: it holds `mkdir <state>/lock`;
a report started meanwhile touches `<state>/pending` and exits, and the running one reports once more
when it finds `pending`. A lock older than 10 minutes is left by a crash and is taken over.

## What a report contains

- Branches: local branches not contained in `<remote>/<default>`, by full ref (`refs/heads/<name>`, so
  a tag of the same name changes nothing), reported as `<name>`; private prefixes match `<name>`.
  `pushed` is true when the tip is contained in some `refs/remotes/<remote>/*`.
- Features of a branch: the `specs/<dir>/` that the branch changed since it left the default branch
  (`git diff <base>...<ref>`) and whose tree still differs from the default branch's. A dir that is
  also on the default branch is kept only when a commit of the branch touching it has no
  patch-identical commit on the default branch (`git log --cherry-pick --right-only --no-merges
  <base>...<ref> -- specs/`), so a branch that landed by rebase-merge or cherry-pick carries nothing
  even after the default branch edits the spec again. At most 200 features per branch.
- When the repository has a remote but `refs/remotes/<remote>/<default>` is missing, nothing is sent
  and the error `<remote>/<default> not found; check the project's default branch on the hub (it is
  <default>)` is recorded. Only a repository with no remote at all reports every branch with every
  `specs/` dir and `default: null`.
- A feature's owner is the author of the oldest commit that added its `spec.md`, following renames
  (`-M`) but not copies (`git log --follow` would also follow copies, which gives a new spec that
  resembles another one that spec's author).

## Output rules (Art. 3.6)

- A hook prints nothing, except the one-line notice for an error the developer has to fix, at most
  once a day per clone (FR-006).
- `hook` returns in under 100 ms (SC-004).
- Network failures and hub errors other than 401, 403 and 404 are silent.
