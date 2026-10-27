---
name: reporter-testing
description: How to change and test the POSIX sh reporter (packages/extension/scripts/spec-hub) — end-to-end tests against an in-process hub, git path quoting, macOS ref-name limits, hook timing. Use when editing the reporter script, adding reporter commands, writing or debugging tests in apps/server/test/reporter/, or when a feature folder with odd characters doesn't show up on the board.
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
- **Landed-by-rebase features (FR-012).** A rebase-merged branch kept locally is never contained in
  `origin/main` and its spec dir differs once main edits the spec again, so tree comparison alone
  calls it in flight. Dirs that also exist on main are filtered by patch identity (`KEEP_AWK` over
  `git log --cherry-pick --right-only --no-merges --name-only <base>...<ref> -- specs/`), run only
  for branches with such a dir. To simulate: on main add an unrelated commit, then
  `git cherry-pick main..<branch>` (without the extra commit the picks can get the original hashes
  and the branch just looks merged), then edit the spec on main and push.
- Counting concurrent reports: put a proxy `serve({ fetch })` in front of `app.fetch` that counts
  in-flight requests and sleeps (see the hook-burst test in `hardening.test.ts`).
- The hub bounds manifest times to now + 1 day (`packages/core/src/manifest.ts`), so a commit with
  a far-future date makes the whole report a 400.
- Background reports start after hooks; poll the DB (100 ms steps, 5 s cap) instead of sleeping.
- Hook budget: foreground `hook` < 100 ms (median ~20 ms on the M-series dev machine); the test
  fails above 150 ms to tolerate load. The fast path makes one git call
  (`git config --local --show-origin spec-hub.cloneId`).

## Measuring report time
Build a synthetic clone like `specs/001-team-board/validation.md` (124 local branches: 83 merged
into `origin/main`, 40 with feature commits over 30 dirs), set `spec-hub.cloneId` and a config with
an unreachable `hub_url`, then `hyperfine -N --warmup 1 --runs 5 'sh <script> report --print-manifest'`
(no token, so it falls back to `main` and sends nothing). Count git processes with
`GIT_TRACE=<file>` and `grep -c 'trace: built-in'`; `GIT_TRACE2_EVENT` gives per-command time.
Budget: 1 git call per in-flight branch without `specs/` changes, 3 with, 4 when a changed dir is
also on main (the cherry-pick log; 15-200 ms each, the old branches cost most), about 10 per report.
On macOS `/usr/bin/git` is the Xcode shim: ~13 ms per call before git starts (Homebrew git ~6 ms),
which is most of a report's time on a repo with many branches. Real-data reference (the pilot repository mirror, 77 unmerged branches, 57 with `specs/` changes, 13 needing the cherry check): report
--print-manifest 3.8 s before the check, 4.9 s with it.

## Known, accepted limits
- A background report racing `disconnect` can leave stray files in `.git/spec-hub`.
