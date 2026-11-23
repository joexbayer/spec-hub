---
name: reporter-testing
description: How to change and test the POSIX sh reporter (packages/extension/scripts/spec-hub) — end-to-end tests against an in-process hub, git path quoting, macOS ref-name limits, hook timing, default-branch listing (finishedTipAt, default.features), extra documents (documents:), content-based carry check, remote branches (sharePushedBranches, remote-cache). Use when editing the reporter script, adding reporter commands, writing or debugging tests in apps/server/test/reporter/, or when a feature folder with odd characters doesn't show up on the board.
---

# Testing the reporter

The reporter is one POSIX `sh` script: `packages/extension/scripts/spec-hub`. Keep
`shellcheck -s sh` and `dash -n` clean. The e2e suites live in `apps/server/test/reporter/`
(`harness.ts` builds sandboxes: temp HOME/XDG, `GIT_CONFIG_NOSYSTEM=1`, a bare origin, a clone
with the script at `.specify/extensions/spec-hub/scripts/spec-hub`).

## Gotchas found the hard way
- **`spawnSync` deadlocks against the in-process hub.** The test process hosts the hub; a
  synchronous child that calls it (`connect`, `report`, `--print-manifest`) blocks the event
  loop until curl times out. Run those commands with async `spawn`. `spawnSync` is fine for git
  and for timing `hook` (its foreground never contacts the hub).
- **Git C-quotes paths** with `"`, `\` or non-ASCII bytes (`"specs/bl\303\245..."`). Text
  parsing of `git diff --name-only` / `ls-tree` then silently drops those features (this broke
  Norwegian names). Use `-z` output (read as below) and drop names with control
  characters explicitly.
- **Branch names** can't contain `\` or spaces; to test shell injection use
  `$(touch${IFS}pwned)` and backticks. A single 300-byte ref fails on macOS (255-byte file-name
  limit for the ref file) — build long names from several path parts (`a…/b…/c…`).
- **Clone-managed hooks run `<common-dir>/spec-hub/spec-hub`, a copy `connect` makes** (mode 700),
  not the work tree's script. Editing the script in a test repo changes nothing for hooks until
  `connect` runs again; `harness.ts` copies `SCRIPT` into the work tree and `connect` copies that.
  Team-managed hooks (`core.hooksPath`) still run the work tree's copy by design.
- **Never use `git log --follow` for owners.** It turns on copy detection against files that still
  exist, so a new `spec.md` that is >= 50% like another spec gets that spec's author (and an
  identical template stub always does). The script traces renames itself from
  `git log -M --name-status` (`OWNER_AWK`).
- Read git `-z` output through `tr '\n\000' '\001\n'`: a newline inside a name becomes `\001`
  (dropped as a control character) instead of splitting into a fake record. `git log -z` puts a
  `\n` after the format line, so the first entry after a header starts with `\001`.
- `%(refname:short)` turns into `heads/<name>` when a tag has the same name: use `%(refname)` and
  pass full refs to git. Every `git log` needs `--no-show-signature` (a user's
  `log.showSignature=true` prints "No signature" into `--format` output; unsigned commits do not
  trigger it, ssh-signed ones do: `gpg.format ssh` + a throwaway `ssh-keygen` key).
- **Content-based carry check (FR-012).** A branch kept locally after it landed (rebase, squash,
  deploy copy) is never contained in `origin/main`, and its spec dir differs once main edits the
  spec again, so tree comparison alone calls it in flight. A feature line (C: dir on main now; F:
  not) is kept only when a document on the branch is a `(path, blob)` pair main never had. `main_had()`/`HAD_AWK` build
  those pairs once per report, lazily, via `git log --raw --no-abbrev --no-renames
  --diff-merges=first-parent -z <base> -- specs/`; `KEEP_AWK` applies the test to C and F lines (F
  lines with no documents at all are kept).
- **Fixture recipes for the carry check.**
  - Deploy branch: a branch that commits a COPY of main's older tree (`git checkout <old-main> -- .`,
    then commit; not a merge), with main moved on twice so no patch matches.
  - Squash-merge leftover: a 2-commit branch, `git merge --squash` into main, then main edits the
    spec again.
  - Positive "still carries" tests cannot fail against the old (cherry-pick) check, which reported
    more. Only the negative tests prove the change.
- Counting concurrent reports: put a proxy `serve({ fetch })` in front of `app.fetch` that counts
  in-flight requests and sleeps (see the hook-burst test in `hardening.test.ts`).
- The hub bounds manifest times to now + 1 day (`packages/core/src/manifest.ts`), so a commit with
  a far-future date makes the whole report a 400.
- Background reports start after hooks; poll the DB (100 ms steps, 5 s cap) instead of sleeping.
- Hook budget: foreground `hook` < 100 ms (median ~20 ms on the M-series dev machine); the test
  fails above 150 ms to tolerate load. The fast path makes one git call
  (`git config --local --show-origin spec-hub.cloneId`).

## Default-branch listing (spec 005)

- The reporter leaves `default.features` out when `GET /config`'s `finishedTipAt` (Unix seconds) is set and the clone's `<remote>/<default>` commit time is not newer (the hub's own rule). Shallow clones (`git rev-parse --is-shallow-repository`) never send it. See it with `sh <script> report --print-manifest` (only GET /config is sent).
- Landing time comes from `git log --first-parent --diff-merges=first-parent --name-only`: a merge commit is credited with the folders it brought in, so `addedAt` is the merge time, not the branch commit's. Read through the usual tr, header lines are `^\001[0-9]+$` and names may start with `\001`.
- Build test history with `git -c core.hooksPath=/dev/null ...` when a background report must not race the push you are about to make.
- `connect` reports at once and sets the project's `finishedTipAt` to now. Tests that assert a listing call `forgetTips(projectId)` first, and build branches with hooks off (`git -c core.hooksPath=/dev/null`) when a background report must not store the listing early.
- Extra documents: `documents:` is read once per report (`extra_names()`, validated in sh) and passed to the awk programs as `-v extra_names=…`. The intermediate F line carries an `extra` JSON field BEFORE the owner field (owner is "rest of line"). A repo without the key must produce a byte-identical manifest: compare `report --print-manifest` with the old script, `generatedAt` normalised.
- Vitest `-t "extra"` also matches the hook-timing test ("prints nothing extra"); use a narrower pattern.
- The hook-timing test (median < 150 ms) flakes under heavy machine load; re-run it alone before suspecting a change that doesn't touch `cmd_hook`.
- The first report after the default branch moves runs two extra full-history `git log`s over `specs/` (about 1 s on a 8,000-commit repo); they are skipped once the hub has the tip.

## Remote branches (spec 004)

- The reporter reads `sharePushedBranches` from `/config`. Off: the cache file is removed and the
  manifest is byte-identical to a reporter without the feature.
- `remote_branches` lists `refs/remotes/<remote>/*` that are not merged, from the last 14 days,
  minus HEAD, minus names of REPORTED local branches and their `%(upstream)` (6th field of
  `$TMP/branchlist`), minus private prefixes. A remote branch with no feature lines is not emitted.
  Skipped in shallow clones (their history is incomplete, so the content check would be wrong).
- B lines with a `remote` marker become `"remote":true`; summaries (`count_branches`, `count_dirs`)
  count only the clone's own branches.
- Cache `<state>/remote-cache`: a key line (`git hash-object` of the list with tips, the default
  tip, extra names, private prefixes and the running script) followed by up to 500 branches' lines,
  cut to the room left after local branches when appended (room is not in the key, so a new local
  branch does not force a recompute). Read once via a copy in `$TMP`; written via a temp file and
  `mv`; not written when the content check's `git log` failed (`$TMP/had-failed`).
- Content check (FR-014): `main_had` runs whenever any branch has feature lines; `KEEP_AWK` drops a
  line (C or F) whose present documents are all versions main had, so a squash leftover of a folder
  main later renamed carries nothing. An F line with no documents at all is kept.
- Test a teammate: `git clone <sandbox root>/clone-origin.git mate`, commit and push from it, run
  `git fetch` in the connected clone, and set the option with
  `db.update(project).set({ sharePushedBranches: true })`.
- A scratch `/config` can be served with `python3 -m http.server` from
  `www/api/r/<slug>/config` (slug of at least 2 characters). Stop it afterwards.

## Measuring report time
Build a synthetic clone like `specs/001-team-board/validation.md` (124 local branches: 83 merged
into `origin/main`, 40 with feature commits over 30 dirs), set `spec-hub.cloneId` and a config with
an unreachable `hub_url`, then `hyperfine -N --warmup 1 --runs 5 'sh <script> report --print-manifest'`
(no token, so it falls back to `main` and sends nothing). Count git processes with
`GIT_TRACE=<file>` and `grep -c 'trace: built-in'`; `GIT_TRACE2_EVENT` gives per-command time.
Budget: 1 git call per in-flight branch without `specs/` changes, 3 with (15-200 ms each, the old
branches cost most), about 10 per report. The content check adds one `git log --raw` per report when
any branch has feature lines.
On macOS `/usr/bin/git` is the Xcode shim: ~13 ms per call before git starts (Homebrew git ~6 ms),
which is most of a report's time on a repo with many branches. Real-data reference (the pilot, 2026-11-23): 304 unmerged remote branches take ~72 s to check, the
~34 changed in the last 14 days ~12 s; with the remote cache a report without a new fetch costs about
what it does with the option off. On a 400-commit scratch repo with 8 deploy branches the content
check took 4.8 s against the cherry-pick check's 7.0 s.

## Known, accepted limits
- A background report racing `disconnect` can leave stray files in `.git/spec-hub`.

## MCP headers (`mcp`, `mcp-headers`)
- `.mcp.json`'s `headersHelper` is run by Claude Code through a shell, **from the directory that
  holds `.mcp.json`**, fresh on each connect/reconnect, 10 s timeout; stdout must be a JSON object
  of string headers. So the committed command can be the relative `sh .specify/.../spec-hub
  mcp-headers`, and the token never needs an env var (docs: code.claude.com/docs/en/mcp).
- The e2e test runs the helper the same way (`sh -c <headersHelper>` in the repo dir) and calls the
  in-process hub with the real MCP client; the plain `fetch` works there because the transport is
  async (no `spawnSync` deadlock).
