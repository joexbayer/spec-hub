# Feature Specification: Team board — see what everyone is working on

**Feature Branch**: `001-team-board`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Layer 1 of Spec Hub: the hub, a silent reporter in each developer's
clone, and a read-only board, piloted on one real team. User story: 'I wanna see what others are
working on.' Infer everything from what developers already commit; nobody updates a status by
hand. It cannot be annoying."

## Clarifications

### Session 2026-10-26

- Q: Should committed but unpushed work show on the board, and can a developer keep a branch
  private? → A: All committed work shows, pushed or not. A developer can keep branches off the
  board with branch-name prefixes they set for their clone (FR-009).
- Q: Should the board visualize the work, and track dependencies now? → A: Yes. There are three
  board views (list, pipeline, work map), plus a dependency map built from "Depends on" links
  (FR-035 to FR-039, User Story 6). The visual design takes cues from the Shadcnblocks admin kit
  but copies none of its code (constitution Art. 6).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My work shows up by itself (Priority: P1)

A developer works on a feature the way they already do: they run Spec Kit commands, edit the spec,
plan and tasks, and commit, often in one of several local worktrees and often long before pushing.
Without running any extra command, answering any prompt or seeing any output, their feature appears
on the team's board, with the right phase and task progress, and stays current as they commit.

**Why this priority**: The board is only worth opening if it is complete and current without
effort. Today in-flight work is invisible until it reaches a pull request, and manual status lines
rot. Everything else in this feature depends on this.

**Independent Test**: Connect one clone, commit a new spec on a local branch that has never been
pushed, then tick two tasks and commit again. Check that the hub holds the feature with the correct
phase and "2 of N" progress after each commit, and that the terminal showed nothing extra.

**Acceptance Scenarios**:

1. **Given** a connected clone, **When** the developer commits a new `spec.md` for feature 112 on a
   local branch, **Then** feature 112 appears on the board in the Specify phase, owned by that
   developer and marked as not pushed, and the commit printed nothing extra.
2. **Given** feature 112 is on the board, **When** the developer commits a `tasks.md` with 3 of 19
   tasks ticked, **Then** the board shows feature 112 in the Implement phase with progress 3/19.
3. **Given** the hub is unreachable, **When** the developer commits, **Then** the commit succeeds
   at normal speed with no output, and the board is correct after the next commit once the hub is
   back.
4. **Given** the developer deletes the branch that carried feature 112 before it landed, **When**
   their clone next reports, **Then** feature 112 is no longer on the board.
5. **Given** the developer has set `scratch/` as a private prefix, **When** they commit a spec on
   `scratch/try-idea`, **Then** nothing about that branch reaches the hub.

---

### User Story 2 - See what everyone is working on (Priority: P1)

A team member opens the board in a browser and sees every feature in flight across the team: who
owns it, what phase it is in, how far the tasks are, which branch it is on, whether it has been
pushed, and when it last changed. They open a feature and read its spec, plan and tasks as
committed, including work that exists only on a teammate's machine.

**Why this priority**: This is the user's story. It replaces asking around and checking branches
and worktrees by hand.

**Independent Test**: With two connected members each committing one feature, a third member signs
in and, without asking anyone, names each feature's owner, phase and progress, and reads both specs.

**Acceptance Scenarios**:

1. **Given** members A and B each have one feature in flight, **When** member C opens the board,
   **Then** C sees both features with owner, phase, progress, branch, pushed state and last change,
   most recently changed first.
2. **Given** C has the board open, **When** A commits a change to their feature, **Then** C's board
   reflects it within 30 seconds without reloading.
3. **Given** C opens A's feature, **When** the detail view loads, **Then** C can read A's spec, plan
   and tasks as A last committed them, with diagrams rendered and the time each document last
   changed.
4. **Given** A and B both created a feature numbered 107 with different names, **When** anyone
   views the board, **Then** both entries carry a visible number-collision flag naming the other.
5. **Given** A's feature reaches the default branch, **When** anyone views the board, **Then** it
   shows as landed for 14 days and then leaves the board.

---

### User Story 3 - Ask from my agent (Priority: P2)

A developer asks their coding agent "what is the team working on?" or "where is feature 104?" The
agent answers from the hub through MCP, using the project linked to the repository it is working
in, in a few lines.

**Why this priority**: Developers spend their day in agent sessions; this is the user's "proper MCP
server". It reads the same data as the board, so it is cheap once Story 2 exists.

**Independent Test**: In an agent session in a connected repository, ask for the board and for one
feature. Check the answers match the web board, fit on one screen and needed no project name.

**Acceptance Scenarios**:

1. **Given** a connected repository with 6 features in flight, **When** the agent asks the hub for
   the board, **Then** it receives one line per feature (number, title, owner, phase, progress).
2. **Given** feature 104 is in flight, **When** the agent asks for feature 104, **Then** it receives
   phase, progress, owner, branches and last change, and can ask for the full text of one document.
3. **Given** the agent is connected, **When** it lists what it can do, **Then** nothing can change
   state: every capability in this feature is read-only.

---

### User Story 4 - Join in under 2 minutes (Priority: P2)

A developer assigned to the project signs in with GitHub, creates a personal token, enables reporting in their
clone and adds the agent connection, following steps the hub shows them. Their in-flight work
appears on the board right away. They can check at any time whether their clone is connected.

**Why this priority**: Every member must be connected for the board to be complete, and a slow or
fiddly setup is the first thing that makes a tool annoying (Art. 3.8).

**Independent Test**: Time an assigned developer who has not seen the hub before, from first sign-in
to their existing in-flight feature appearing on the board.

**Acceptance Scenarios**:

1. **Given** an assigned developer with a clone of the linked repository, **When** they follow the
   hub's connection steps, **Then** their in-flight features appear on the board within 2 minutes
   of their first sign-in.
2. **Given** a connected clone, **When** the developer checks its connection status, **Then** they
   see the project it reports to and when it last reported successfully.
3. **Given** a developer's token was revoked, **When** their clone next tries to report, **Then**
   they see one line saying reporting stopped and why, and no more than once a day after that.
4. **Given** a connected clone, **When** the developer disables reporting, **Then** it stops in one
   step and the repository is exactly as it was before reporting was enabled.

---

### User Story 5 - Set up a project for a team (Priority: P3)

An administrator creates a project for a repository, links it with a setting committed in the
repository, and assigns team members to it by GitHub username. They can remove
members, and they can see a record of sign-ins, token changes and membership changes.

**Why this priority**: Needed once per team. Kept minimal because the pilot has one team of four.

**Independent Test**: As an administrator, create a project, link it, assign one waiting person, remove
them, and check the record shows each step and that the removed member's tokens no longer work for
the project.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** they create a project and commit its link setting to the
   repository, **Then** clones of that repository report to that project.
2. **Given** a project member, **When** an administrator removes them, **Then** their tokens stop
   working for the project immediately and their unlanded features leave the board.
3. **Given** a person who belongs to no project, **When** they sign in, **Then** they see only a
   page saying they are waiting for access, with their GitHub login to give an administrator, and
   they can't create tokens or see any project data.
4. **Given** a person waiting for access, **When** an administrator assigns them to a project,
   **Then** on their next page load they reach that project and its connect steps.

---

### User Story 6 - See how the work connects (Priority: P2)

A team member wants the picture, not just the list. They switch the board to a pipeline that lays
every in-flight feature out by phase. They open a work map that shows who is carrying which
branches and which features those branches change. They open a dependency map built from the
"Depends on" links the specs already contain, and see what is blocked, and by what. The longest
chain of unfinished dependencies is highlighted as the critical path.

**Why this priority**: The user asked to see the work visually. In the pilot, dependencies already
exist as links in spec headers but nobody can see them across features, so a blocked feature is
found out late. Every view reuses data the reporter already sends.

**Independent Test**: With three in-flight features where C's spec links to B, B's to A, and A has
not landed, open the dependency map. Check that C and B are marked blocked, the critical path is
A → B → C, and each view lists the same features as the board.

**Acceptance Scenarios**:

1. **Given** features in Specify, Plan and Implement, **When** a member opens the pipeline view,
   **Then** each feature sits in the column for its phase, with owner and progress, and recently
   landed features sit in a final column.
2. **Given** two members carrying three branches, **When** a member opens the work map, **Then** it
   shows each member linked to their branches, each branch linked to the features it changes, and
   unpushed branches marked as such.
3. **Given** feature 112's spec has `**Depends on**: [SPEC-099](../099-incremental-reconciliation/spec.md)`
   and 099 has not landed, **When** a member opens the dependency map or feature 112, **Then** 112
   shows as blocked by 099. Once 099 lands, 112 is no longer blocked.
4. **Given** two specs that link to each other, **When** the map loads, **Then** the cycle is shown
   and marked, and the map still renders.

---

### Edge Cases

- **Hub down for hours**: reports fail silently; the next report after recovery restores an
  accurate board, because every report is a complete picture of the clone's work.
- **Two machines**: one person's two clones both report; the board shows one entry per feature.
- **Same feature in two clones**: two members carry the same feature (pairing, or one checked it out
  to read it). The board shows one entry with the owner by the ownership rule, lists every branch
  carrying it, and shows the most recently changed version.
- **Renumbering or renaming**: a feature directory renamed on a branch disappears under its old name
  and appears under the new one on that clone's next report; no orphan entry remains.
- **Landing style**: a feature counts as landed once its directory is on the default branch,
  whatever merge style was used.
- **Old merged branches**: a branch whose last commit is already contained in the default branch is
  not in flight. A branch that was rebase-merged (or cherry-picked) and kept locally is not in flight
  either, even after the default branch edits the feature again: its changes are on the default
  branch by content. A branch that was squash-merged and kept locally falls into the stale group
  after the staleness window.
- **First connection of an existing repository**: features already on the default branch when the
  project is first connected count as history. They are never shown as recently landed (the pilot
  has over a hundred).
- **Odd documents**: a feature directory without `spec.md`, or a spec without a title line, is still
  listed, titled from its directory name. Checkboxes that are not Spec Kit tasks do not count toward
  progress.
- **Oversized documents**: a document over the size limit is shown as "too large to display"; the
  rest of the report is accepted.
- **Timestamp numbering**: projects that number features by timestamp get no collision checks.
- **Existing git hooks**: a repository that already uses git hooks (the pilot has a pre-push hook)
  keeps them working when reporting is enabled.
- **Not linked**: a clone of a repository with no link setting, or with a link to a project the
  person is not a member of, reports nothing; the on-demand status check says why.
- **Untrusted content**: markup or scripts inside a document never run in the board and never change
  the page around them.
- **Dependencies on unknown features**: a "Depends on" link to a directory the hub has never seen,
  for example one renumbered away, shows as an unknown dependency rather than being dropped. A
  link from a spec to its own feature is ignored.
- **Dependency text without a link**: free text in the header (the pilot writes "the hotfix landed
  on main at 53cba2ab") is not a dependency. Only links to feature directories count.

## Requirements *(mandatory)*

### Functional Requirements

**Reporting from clones**

- **FR-001**: A connected clone MUST report to the hub automatically after commits, branch switches
  and merges (including pulls), with no command, prompt or output in normal operation.
- **FR-002**: A report MUST be a complete picture of the clone's feature work: for each local branch
  that carries a feature absent from, or different from, the default branch, the branch name, those
  features' documents as committed, the last commit time, and whether the branch has commits its
  shared remote does not. It MUST also say which features the default branch holds, as the clone
  last received it from the shared remote.
- **FR-003**: A newer report from a clone MUST replace that clone's previous report. Work missing
  from the newer report (deleted, renamed or merged branches) MUST leave the board.
- **FR-004**: Reports MUST contain committed content only. Uncommitted edits never leave the
  machine.
- **FR-005**: Reporting MUST never block or fail a git operation, never add noticeable delay to one,
  and print nothing when it succeeds or when the hub is unreachable.
- **FR-006**: When reporting fails for a reason the developer must fix (invalid or revoked token,
  not a member, repository not linked), the developer MUST be told in one line, at most once per day
  per clone.
- **FR-007**: A developer MUST be able to check on demand whether a clone is connected, which project
  it reports to, and when it last reported successfully.
- **FR-008**: Enabling reporting MUST be one step per clone and MUST keep the repository's existing
  git hooks working. Disabling MUST be one step and MUST leave the repository as it was.
- **FR-009**: Committed work MUST show whether or not it has been pushed. A developer MUST be able to
  set branch-name prefixes for their clone (for example `scratch/`). Branches with those prefixes
  are never reported, so their content never leaves the machine. With no prefix set, every branch
  is reported. The status check (FR-007) lists the clone's private prefixes.
- **FR-010**: The hub MUST reject malformed, oversized or unauthorized reports without changing any
  stored state.

**The board**

- **FR-011**: Signed-in members MUST see their project's board: one entry per in-flight feature,
  with number, title, owner, phase, task progress, branches, pushed state, last change time and open
  clarification count, most recently changed first.
- **FR-012**: A feature MUST be in flight when a member's latest report carries it on a branch not
  already contained in the default branch, that branch changed the feature since it left the
  default branch, and the feature is absent from, or different from, the default branch. A feature
  that differs only because the default branch moved on after the branch was cut is not in flight
  on that branch. For a feature that is on the default branch, the branch's changes to it are
  compared by content, so work that landed through a rebase or cherry-pick counts as landed: the
  feature is in flight on that branch only while the branch has a change to it that the default
  branch does not. An in-flight feature that is already on the default branch is marked as a change
  to a landed feature.
- **FR-013**: Phase MUST be inferred from the committed documents of the version shown, first match
  wins:
  1. **Clarify**: `spec.md` contains a clarification marker in Spec Kit's form (the marker text, a
     colon and a question, in square brackets) outside code. A spec that only mentions the marker
     in code, as this one does, is not in Clarify.
  2. **Implement n/m**: `tasks.md` has at least one completed task. When all tasks are completed,
     the phase is **Implemented**.
  3. **Tasks**: `tasks.md` exists with no completed task.
  4. **Plan**: `plan.md` exists.
  5. **Specify**: otherwise.
- **FR-014**: Task progress MUST count only lines in Spec Kit's task-list format; other checkboxes
  MUST be ignored.
- **FR-015**: The owner MUST be the person named in the spec's owner header when there is one.
  Otherwise it is the person who first committed the feature's `spec.md`, shown by their git name
  when they are not a member.
- **FR-016**: A feature with no change for 14 days MUST move to a collapsed "stale" group. Nothing is
  deleted. A change is a commit that touches the feature's folder, or any commit on the feature's own
  branch: one whose name (its last `/` segment) starts with the feature's number, as Spec Kit names
  them. Someone committing code on `010-eval-gate` is working on 010 even while its spec is untouched.
- **FR-017**: A feature MUST count as landed from the first report in which its directory is on the
  default branch, whatever merge style was used. It shows in a "recently landed" group for 14 days
  and then leaves the board. Features already on the default branch when the project was first connected MUST
  never show as recently landed.
- **FR-018**: For sequentially numbered projects, two in-flight features with the same number and
  different names MUST both carry a number-collision flag naming the other.
- **FR-019**: An open board MUST reflect a new report within 30 seconds without reloading.
- **FR-020**: Members MUST be able to open a feature and read its spec, plan and tasks as committed on
  the branch shown, with each document's last change time and branch. Diagrams written as text in
  the documents MUST render as diagrams.
- **FR-021**: Document content MUST be treated as untrusted: rendered so that markup in it cannot
  run scripts, load content from elsewhere, or alter the page around it.

**Agent access**

- **FR-022**: Members' agents MUST be able to ask the hub over MCP for the board and for a single
  feature, scoped to the project linked to the repository the agent works in, without naming the
  project.
- **FR-023**: Board answers MUST use one line per feature, and mark features that are blocked. A
  feature answer gives phase, progress, owner, branches, last change, what it depends on and what
  depends on it. The agent can ask for the full text of one document.
- **FR-024**: Every agent capability in this feature MUST be read-only.

**People, projects and access**

- **FR-025**: People MUST sign in with their GitHub account. Anyone with a GitHub account can sign
  in, but a person who is not a hub administrator and belongs to no project MUST see only a
  "waiting for access" page (showing their GitHub login) and MUST NOT be able to create tokens or
  read any project data.
- **FR-026**: Whoever operates the hub MUST designate the first (hub) administrators, by GitHub
  account id rather than login, since a login can be renamed and then taken by someone else.
- **FR-027**: Administrators MUST be able to create projects, set each project's default branch name
  (default `main`), assign people to a project by GitHub username, whether or not they have signed
  in yet (hub administrators to any project, project administrators to their own), remove members and grant the administrator role.
  Administrators MUST see who is waiting for access. A person can belong to several projects.
  Membership belongs to the person's GitHub account, so renaming a login keeps it, and a new account
  that takes an old login gets none of it.
- **FR-028**: A repository MUST be linked to a project by a setting committed in the repository.
- **FR-029**: Members MUST be able to create, name, list and revoke their own personal tokens. A
  token is shown once, when it is created, and the hub stores it only in a form that cannot be
  turned back into the token. Each token acts as exactly one person, carries the permissions it was
  created with (reporting, reading), and stops working as soon as it is revoked.
- **FR-030**: Every read and write MUST be authorized against project membership. A person sees only
  the projects they belong to. Removing a member MUST immediately stop their tokens working for that
  project and remove their unlanded features from the board.
- **FR-031**: The hub MUST record sign-ins, token creation and revocation, membership and role
  changes, and project creation and linking, with actor and time. The record is append-only and
  visible to the project's administrators.
- **FR-032**: The hub MUST show a newly assigned member the steps to connect: sign in, create a
  token, enable reporting in a clone, and add the agent connection.

**Views and dependencies**

- **FR-035**: The board MUST offer three views of the same in-flight features:
  - a **list**;
  - a **pipeline**, which places each feature in a column for its phase, with recently landed
    features in a final column;
  - a **work map**, which links each member to the branches they carry and each branch to the
    features it changes, marking unpushed branches.
- **FR-036**: A spec's dependencies MUST be the links in its "Depends on" header (same form as the
  owner header) that point to another feature's directory. Other text in that header, links
  elsewhere in the spec, and links to the spec's own feature are ignored.
- **FR-037**: Members MUST be able to open a dependency map of the in-flight features and every
  feature they depend on, whether that feature is in flight, landed or unknown.
  - A feature that depends on one not yet landed MUST be marked blocked.
  - The longest chain of not-yet-landed dependencies MUST be highlighted as the critical path.
  - A cycle MUST be shown and marked without breaking the map.
- **FR-038**: Each feature's detail MUST show what it depends on and what depends on it, each with
  its phase.
- **FR-039**: Every view MUST use the same rules as the list (FR-012 to FR-018), so a feature
  appears, with the same phase and owner, in every view or in none.

**Boundaries**

- **FR-033**: The hub MUST NOT write to any repository or contact any git host in this feature
  (Art. 1.2). Reporting is one-way, from clones to the hub.
- **FR-034**: The hub MUST NOT send messages of any kind in this feature, and MUST NOT add prompts
  to Spec Kit commands.

### Key Entities

- **Person**: someone who signs in with a GitHub identity. Has personal tokens and memberships.
- **Project**: one repository's coordination space. Has a short identifier used by the link
  setting, a default branch name, a numbering style, members and administrators.
- **Membership**: a person's role in a project, member or administrator.
- **Personal token**: a named credential acting as one person, with permissions; created, listed and
  revoked by that person.
- **Clone**: one working copy on one machine that reports to a project as one person. Its latest
  report replaces the previous one.
- **Report**: a clone's complete picture of its feature work at one moment: branches, the features
  each carries, document content as committed, pushed state, and the default branch's features.
- **Feature**: a directory under `specs/`, identified by its directory name (number and short name).
  Has a title, owner, phase, task progress, the branches and clones that carry it, last change, and
  a landed time.
- **Document**: the content of a feature's `spec.md`, `plan.md` or `tasks.md`, identified by its
  git content ID, so a later layer can tie approvals to exactly what was read (Art. 4.2).
- **Security event**: an append-only record of who did what, and when, for access and membership.
- **Dependency**: a link from one feature's spec to another feature's directory, taken from the
  "Depends on" header of the version shown. It is resolved at read time to that feature's state:
  in flight, landed or unknown.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: During a two-week pilot, spot checks on three separate days find 100% of
  members' committed in-flight features on the board, with owner and phase matching the clones in
  at least 95% of entries.
- **SC-002**: A committed change appears on every open board within 30 seconds.
- **SC-003**: An assigned developer goes from first sign-in to their in-flight work on the board in
  under 2 minutes.
- **SC-004**: Git commands in a connected clone are no more than 100 ms slower, and a hub outage
  never makes a git command fail or print anything.
- **SC-005**: "What is the team working on?" is answered from the agent in one request, in one
  screen, for a project with up to 30 features in flight.
- **SC-006**: All four pilot developers stay connected through the pilot; none disables
  reporting.
- **SC-007**: Every pair of in-flight features that share a number is flagged on the board before
  either reaches the default branch.
- **SC-008**: In the pilot, every link in the "Depends on" headers of in-flight pilot specs
  appears in the dependency map, and no dependency appears that isn't such a link, checked on the
  same three spot-check days as SC-001.

### Annoyance budget (Art. 3.8)

| Budget line | Effect of this feature |
|---|---|
| Zero messages on a day with nothing to act on | Sends no messages at all |
| Exactly one message per reviewer per review request | No reviews yet |
| At most one extra prompt per Spec Kit command | Adds no prompts |
| New developer connected in under 2 minutes | Required by SC-003 |

Reporting prints nothing in normal operation. Its only output is one line, at most once a day, when
the developer must fix something (FR-006).

## Assumptions

- The pilot team works in git with Spec Kit's `specs/<id>-<slug>/` layout and a shared remote whose
  default branch is `main`.
- Every member has a GitHub account. Sign-in uses it; this feature needs no access to the
  repository on GitHub and no GitHub App.
- The team hosts the hub where all members can reach it over HTTPS. For the pilot, the user hosts
  it.
- Administrators assign members one by one; four people need nothing faster. Letting everyone in
  a GitHub organisation or team in automatically is a later layer.
- A feature's owner can be overridden by an owner header, which the pilot's specs already carry.
- "Last change" uses commit time; ordering of reports from one clone uses the time the hub received
  them.
- 14 days is the default for both the staleness window and the landed window.
- Out of scope for this feature, and planned for later layers: review requests, approvals and
  objections, notifications and the digest (including "your dependency landed"), chat integration,
  AI summaries, number claims, the merge gate, the GitHub App, and signing agents in without a
  token.
- Sign-in is open to any GitHub account, and access starts only when an administrator assigns the
  person to a project (decided 2026-10-26, replacing invite-only sign-in). One hub serves one
  organisation; teams are projects within it (decided 2026-10-26). Tokens don't expire. Revocation and "last used" cover a leaked token
  (decided 2026-10-26).
- A number collision is also flagged when an in-flight feature reuses the number of a landed
  feature under a different name (decided 2026-10-26).
