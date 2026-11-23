# Feature Specification: Teammates' pushed work on the board

**Feature Branch**: `feat/team-visibility`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Optional: show teammates' pushed feature branches on the board even when
their own clone is not connected. Today a clone reports only its local branches; remote-tracking
branches are read only to decide what is pushed and where the default branch is. So a teammate who
never connected is invisible even though their feature branches are pushed and present in every
connected teammate's clone. When the option is on for a project, a connected clone also reports
unmerged remote branches that change specs/, so one connected person makes the whole team's pushed
work visible. Owners resolve as today, never as the reporting person. Off by default and easy to turn
on; with it off, behaviour is exactly as today. Private branch prefixes still apply. Stay within the
reporter's constraints and Art. 2.5."

## Context

Spec 001 makes the board a picture of what connected clones report: each clone reports its own local
branches (FR-002). A teammate who has not connected is invisible, even when their feature branches
are pushed to the shared remote and therefore already sit in every connected teammate's clone as
remote-tracking branches. In the pilot, one person's work fills the board while two teammates have
several pushed, unmerged spec branches that never appear. Until everyone connects, the board
understates the team's work, and a board that looks like a one-person team is easy to stop reading
(Art. 3).

This feature adds a project option, **share pushed branches**. With it on, a connected clone also
reports the feature work it can see on the shared remote's branches, so a single connected person
makes the whole team's pushed work visible. With it off, nothing changes.

## Clarifications

### Session 2026-11-19

- Q: Where is the option set? → A: By a project admin in the hub's project settings, next to the
  default branch and numbering; every connected clone picks it up from its next report.
- Q: What happens to remote branches with no change for 14+ days? → A: They are reported and show
  in the collapsed stale group, by the same rule as all other work.

### Session 2026-11-23

- Q: Long-lived deploy branches (the pilot's `chore/staging`, `chore/production`) seem to carry dozens
  of landed features. Ignore them by a project list? → A: No. They hold old copies of specs that
  main already had (production: 24 folders, all old; staging: 35, of which only 2 are new work),
  and the landing check misses them because it compares commits, which tree copies and squash
  merges defeat. Fix the check instead, for every branch, local or remote: a branch carries a
  feature only when one of its documents is a version the default branch never had.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the team's pushed work before everyone connects (Priority: P1)

A team lead turns the option on for the project. From the next report of any connected clone, the
board shows every feature that a teammate has pushed on an unmerged branch, owned by the person who
wrote it, even though that teammate never connected.

**Why this priority**: This is the whole value: partial adoption stops hiding work.

**Independent Test**: In a project where only one member's clone is connected and a second member
has pushed a feature branch with a spec, turn the option on, make one commit in the connected clone,
and check that the second member's feature appears on the board with the second member as owner.

**Acceptance Scenarios**:

1. **Given** the option is on and Anders (a member, not connected) has pushed `025-mcp-governance`
   with a spec, **When** Joe's connected clone, which has fetched that branch, reports, **Then**
   the board shows feature 025 in flight, owned by Anders, on branch `025-mcp-governance`, pushed.
2. **Given** the same, **When** a member looks at feature 025, **Then** nothing on the board or the
   feature page says Joe is working on it: the branch is marked as seen on the shared remote, not
   as one of Joe's branches, and Joe's in-flight count does not include it.
3. **Given** the pushed branch's spec names an owner in its owner header, **When** it is reported,
   **Then** that person is the owner (FR-015 of spec 001), as for any reported feature.
4. **Given** the spec was first committed by someone who is not a member, **When** it is reported,
   **Then** the owner is shown by their git name, as today.

---

### User Story 2 - Off means exactly today's behaviour (Priority: P1)

A project that does not turn the option on sees no change: clones report only their local branches,
and nothing about remote branches reaches the hub beyond what spec 001 already sends.

**Why this priority**: The option must be safe to ship to every existing project.

**Independent Test**: With the option off, the report a clone sends is identical to the report it
sent before this feature, for a clone that has teammates' remote branches.

**Acceptance Scenarios**:

1. **Given** the option is off (the default), **When** a clone with teammates' remote branches
   reports, **Then** the report contains only its local branches, as in spec 001.
2. **Given** the option was on and is turned off, **When** each connected clone next reports,
   **Then** the features seen only on remote branches leave the board.

---

### User Story 3 - The board stays readable over time (Priority: P2)

Remote branches outlive the work on them: merged branches nobody deleted, abandoned experiments,
branches a teammate later continues locally. The board handles them by the same rules as any other
work, so the option does not flood it.

**Why this priority**: Without this the option is noisy enough that teams turn it off.

**Independent Test**: In a repository with merged-but-undeleted branches, abandoned branches older
than the stale window, and a branch reported both by its author's own clone and as a remote branch
by another clone, check the board shows each feature once, in the right group.

**Acceptance Scenarios**:

1. **Given** a remote branch already contained in the default branch, **When** it is reported,
   **Then** it does not make anything in flight (FR-012 of spec 001).
2. **Given** a remote branch with no change for 14 days, **When** it is reported, **Then** its
   feature is in the collapsed stale group, not in flight (FR-016 of spec 001).
3. **Given** Anders later connects his own clone, which has `025-mcp-governance` locally, **When**
   both his clone and Joe's report, **Then** feature 025 shows once, on Anders's branch as his own
   clone reports it (with his unpushed commits, if any), not twice.
4. **Given** two connected clones both see the same remote branch, **When** both report, **Then**
   the feature shows once.
5. **Given** a teammate deletes a remote branch, **When** a connected clone that no longer has that
   remote branch reports, **Then** work seen only on that branch leaves the board.

---

### Edge Cases

- **A deploy branch built by copying trees** (or any branch left behind after a squash merge): its
  copies of landed specs are versions the default branch already had, so it carries nothing; only
  documents with text the default branch never had make it carry a feature.

- **A remote branch with the same name as one of the reporter's own local branches**: the local
  branch is reported as today; the remote copy is only used to decide whether it is pushed, as
  today, and is not reported a second time.
- **A remote branch whose name starts with one of the reporting clone's private prefixes**: it is
  never reported, as for local branches (FR-009 of spec 001).
- **A clone that has not fetched recently**: it reports the remote branches as it last fetched them.
  The board is as fresh as the most recently fetched connected clone. The reporter never fetches.
- **A clone that fetched without pruning**: a branch deleted on the remote can linger in that clone
  until it prunes; it stays on the board until no connected clone reports it.
- **Remote branches that touch no feature**: they are not reported, as for local branches.
- **Very many remote branches**: the report stays within spec 001's limits on reports (FR-010);
  when there are more feature-carrying remote branches than fit, the most recently changed are kept.
- **Someone pushes a branch to a remote other than the shared one**: only the shared remote the
  clone already uses for "pushed" (spec 001) is read.
- **The option is turned on while a report is running**: it takes effect from the next report.

## Requirements *(mandatory)*

### Functional Requirements

**The option**

- **FR-001**: Each project MUST have a **share pushed branches** option, off by default. A project
  admin MUST be able to turn it on or off in one step in the hub's project settings, next to the
  default branch and numbering.
- **FR-002**: With the option off, a clone's report MUST be exactly what spec 001 defines; no
  information about remote branches beyond spec 001's MUST leave the machine.
- **FR-003**: A clone MUST pick up a change to the option no later than its next report, with no
  action by the developer.

**Which branches carry a feature (all reports, option on or off)**

- **FR-014**: A branch, local or remote, MUST carry a feature only when at least one of that
  feature's documents on the branch (spec, plan, tasks, or a configured extra document) is a version
  the default branch never had. A branch whose documents for a feature are all versions the default
  branch has had (now or earlier) carries nothing for it, whatever its commit history. This replaces
  the commit-based landed check of spec 001 (FR-012) for branches; work on a feature's own branch
  still counts as activity (FR-016 of spec 001).

**What is reported with the option on**

- **FR-004**: With the option on, a report MUST also include each branch on the shared remote that
  carries a feature by spec 001's rules (FR-002 and FR-012 of spec 001) and that is not one of the
  clone's local branches of the same name, with the same information as for a local branch.
- **FR-005**: Remote branches MUST be reported as the clone last fetched them. The reporter MUST NOT
  contact the remote, and MUST work with any git host (Art. 2.5).
- **FR-006**: The reporting clone's private prefixes MUST apply to remote branches exactly as to
  local ones.
- **FR-007**: Reporting remote branches MUST keep spec 001's guarantees: no output in normal
  operation, never block or fail a git operation, no noticeable added delay to one (FR-005 of
  spec 001).
- **FR-008**: Remote branches MUST be reported whatever their age. One with no change for 14 days
  shows in the collapsed stale group like any other work (FR-016 of spec 001); there is no second
  staleness rule for remote branches.

**How it shows on the board**

- **FR-009**: A feature seen on a remote branch MUST be owned by the same rules as any feature
  (FR-015 of spec 001), never by the person whose clone reported it.
- **FR-010**: A branch seen on the shared remote MUST be marked as such wherever branches are shown
  (board, feature page, agent answers), and MUST NOT count as the reporting person's work (for
  example in their in-flight count or as "their branch").
- **FR-011**: The same branch MUST produce one entry, however many clones report it. When the
  branch's author's own clone reports it as a local branch, that report MUST be the one shown.
- **FR-012**: Work seen only on remote branches MUST leave the board when no connected clone's
  latest report carries it any more (option turned off, branch deleted and pruned, branch merged).
- **FR-013**: All board rules (in flight, phase, staleness, landed, collisions, dependencies,
  views) MUST apply to features seen on remote branches exactly as to others (FR-039 of spec 001).

### Key Entities

- **Share pushed branches option**: a per-project on/off setting, off by default.
- **Remote-observed branch**: a branch on the shared remote that a connected clone reports with the
  option on. It has the same facts as a reported local branch (name, documents as committed, last
  change time) and is always pushed. It belongs to no clone's owner: it is marked as seen on the
  shared remote.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With the option on and one connected member, every pushed, unmerged feature branch
  that the connected clone has fetched appears on the board within one report, with the right
  owner, in 100% of cases tested on a copy of the pilot repository.
- **SC-002**: With the option off, reports are byte-for-byte what they were before this feature
  for the same repository state.
- **SC-003**: Turning the option on for the pilot project adds no entry that duplicates a feature
  already on the board, and no feature appears as owned by the person whose clone reported it
  unless they wrote it.
- **SC-004**: A git commit in a clone with 100 remote branches is not noticeably slower with the
  option on than off (the foreground hook stays within spec 001's budget), and the background
  report finishes within 2 seconds of the time it takes with the option off.
- **SC-005**: On the pilot repository with the option on, the in-flight list grows by the teammates'
  active pushed work only; long-dead branches do not crowd the in-flight list.
- **SC-006**: On a copy of the pilot repository, the deploy branch `chore/production` carries no
  feature and `chore/staging` carries only the features with text the default branch never had
  (070 and 106 at the time of writing); feature 150, landed, is no longer shown in flight.

## Assumptions

- Teammates' pushed branches are already visible to everyone with access to the repository, so
  reporting them to a hub whose members are the same team discloses nothing new. The option exists
  so teams choose it, not because the data is secret.
- "Shared remote" is the remote spec 001 already reads to decide whether work is pushed.
- Clones fetch often enough in normal work (pulls, `git fetch`) for the board to be useful; the
  reporter does not fetch, and the board says nothing more precise than "as last fetched".
- Teammates who later connect need do nothing special: their own reports take over their branches.
- The hub still never contacts a git host (FR-033 of spec 001); a GitHub integration that sees
  every branch without any clone is a later layer and complements this, not replaces it.
- The option lives in the hub's project settings, like the default branch and numbering, rather
  than in the repository's Spec Hub config (Art. 2.3). It is a choice about what the team's hub
  shows, not about the repository, and one toggle must reach every connected clone at once.
- This changes spec 001's decision that a clone reports only its own local branches, for projects
  that opt in. Spec 001's research and contracts are updated when this feature is planned.
