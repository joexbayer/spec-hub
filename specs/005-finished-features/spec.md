# Feature Specification: Finished features on the hub

**Feature Branch**: `005-finished-features`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Show finished features on the hub. Today a feature leaves the board 14
days after it lands, and even while it is in "Recently landed" the hub has none of its documents: the
reporter only sends unmerged branches, so a landed feature's page shows just its name and when it was
first seen. Features already on the default branch when the project was connected never show at all.
Teams want to see and read what they have finished: a place in the hub listing every landed feature
(including the history that was there before connecting), with its spec, plan and tasks as they are
on the default branch, owner and when it landed, searchable/filterable like the rest of the board,
and readable by agents through MCP. Landed features stay off the in-flight views (the board stays
about current work). Content must come from what connected clones report (the hub never contacts a
git host, Art. 2.5), within the reporter's constraints (git + curl only, silent, fail open, fast
foreground hook) and report size limits; consider repos with hundreds of landed features, keeping
unchanged documents from being re-sent, a feature whose folder is later deleted or renamed on the
default branch, and a landed feature that is changed again on a new branch (it is both landed and in
flight)."

## Context

Spec 001 makes the hub a picture of work in flight. A feature that lands shows in "Recently landed"
for 14 days (FR-017 of spec 001) and then leaves the board; features that were already on the
default branch when the project was connected never show at all. The hub never receives a landed
feature's documents, because clones report only the branches that are not yet merged, so even
during those 14 days its page shows only a name and a date.

In the pilot, a team member asked why the hub "does not show finished specs". The team's finished
work, often more than a hundred features, is invisible in the one place where they read specs, and
an agent asked about a landed feature over MCP knows nothing about it. People go back to browsing
the repository, which is what the hub is meant to spare them.

This feature adds a **finished features** list to each project: every feature on the default branch,
readable in full, searchable, and available to agents. The board itself does not change: it stays
about current work.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read a finished feature (Priority: P1)

A member wants to know how an earlier feature was specified: what it promised, what was planned and
which tasks were done. They open the project's finished features, find it, and read its spec, plan
and tasks as they are on the default branch.

**Why this priority**: Reading finished work is the core value; without the documents a list is only
an index of folder names.

**Independent Test**: In a project whose default branch holds a feature with spec, plan and tasks,
with one connected clone that has fetched the default branch, open the finished features list, open
that feature, and check that all three documents match the default branch.

**Acceptance Scenarios**:

1. **Given** feature 150 is on the default branch and a connected clone has fetched it, **When** a
   member opens the finished features list, **Then** 150 is listed with its number, title, owner and
   when it landed, and opening it shows its spec, plan and tasks as on the default branch.
2. **Given** feature 141 was on the default branch before the project was connected, **When** a
   member opens the list, **Then** 141 is there too, with when it landed taken from git history.
3. **Given** a finished feature has a spec but no plan or tasks, **When** a member opens it, **Then**
   the spec is shown and the missing documents are shown as absent, as for features in flight.
4. **Given** a feature landed 2 days ago, **When** a member opens it from "Recently landed" on the
   board, **Then** they see its documents, not only its name and date.

---

### User Story 2 - Find finished work (Priority: P1)

A member looking for "the passkey feature" or "everything Anders finished" narrows the list down in
seconds, as they would on the board.

**Why this priority**: With hundreds of finished features, a list without search is unusable.

**Independent Test**: In a project with 150 finished features, find one by a word in its title, by
its number, and list all features owned by one member, each in a few seconds.

**Acceptance Scenarios**:

1. **Given** 150 finished features, **When** a member types "passkey", **Then** only features whose
   title or folder name contains it are listed.
2. **Given** the same, **When** a member types "150", **Then** feature 150 is listed first.
3. **Given** the same, **When** a member filters by an owner, **Then** only that owner's finished
   features are listed.
4. **Given** the list is open, **When** it is first shown, **Then** the most recently landed
   features come first.
5. **Given** a member narrowed the list, **When** they share the page address, **Then** a colleague
   opening it sees the same narrowed list.

---

### User Story 3 - Agents can read finished work (Priority: P2)

A developer asks their agent "how did we specify tenant keys?" The agent asks the hub and gets the
finished feature's documents, as it does for features in flight.

**Why this priority**: Agents are how many members read the hub; finished specs are where earlier
decisions live.

**Independent Test**: Over MCP, ask for a finished feature by number and get its summary and
documents; ask for the finished features list and get one line per feature.

**Acceptance Scenarios**:

1. **Given** feature 079 is finished, **When** an agent asks the hub for feature 079, **Then** the
   answer says it landed, when, and who owns it, and gives its documents as on the default branch.
2. **Given** a project with 150 finished features, **When** an agent asks for finished features
   matching "tenant", **Then** it gets one line per matching feature.
3. **Given** the board answer to an agent, **When** it is produced, **Then** it still lists only in
   flight work and recently landed features, as today.

---

### User Story 4 - The list stays true to the default branch (Priority: P2)

The default branch changes after features land: specs are edited, folders are renamed or removed,
and landed features are changed again on new branches. The list follows the default branch.

**Why this priority**: A list that drifts from the repository teaches people not to trust it.

**Independent Test**: On the default branch, edit a landed spec, rename one feature folder, delete
another, and open a branch that changes a fourth; after the next report from a clone that has
fetched those changes, check the list and the four features' pages.

**Acceptance Scenarios**:

1. **Given** a landed spec is edited on the default branch, **When** a connected clone that fetched
   it reports, **Then** the finished feature shows the edited spec.
2. **Given** a feature folder is removed from the default branch, **When** a connected clone that
   fetched that change reports, **Then** the feature leaves the finished list.
3. **Given** a feature folder is renamed on the default branch, **When** a clone reports, **Then**
   the list shows it under the new name only.
4. **Given** landed feature 157 is changed again on a new branch, **When** both are reported,
   **Then** 157 shows on the board in flight (as today, marked as a change to a landed feature) and
   in the finished list with its default-branch documents, and each page says the other exists.
5. **Given** two connected clones have fetched the default branch at different times, **When** both
   report, **Then** the finished list shows the newer default branch, whichever clone reported last.

---

### Edge Cases

- **No connected clone has fetched the default branch yet**: the finished list is empty and says
  that it fills once a connected clone has fetched the default branch.
- **Hundreds of finished features at first report**: the first report after this feature ships can
  carry many documents; it must stay within spec 001's report limits (FR-010) and the hub fills the
  list over as many reports as needed, without the developer noticing.
- **Unchanged documents**: a document the hub already has is never sent again, so later reports are
  no bigger than today's for an unchanged default branch.
- **A document too large to send**: listed with its facts and marked too large, as for features in
  flight.
- **A folder under `specs/` that is not a feature** (no spec, plan or tasks): not listed, as on the
  board.
- **The project's default branch is changed by an admin**: the list follows the new default branch
  from the next report.
- **A member opens a finished feature that has since been removed**: they see that it is no longer
  on the default branch, not an error.
- **A landed feature's owner has left the project**: shown by their git name, as for any feature
  whose owner is not a member (FR-015 of spec 001).
- **All connected clones disconnect**: the list keeps showing the default branch as last reported
  and says when that was.

## Requirements *(mandatory)*

### Functional Requirements

**What reaches the hub**

- **FR-001**: A connected clone's report MUST include, for each feature on the default branch as the
  clone last received it from the shared remote, its documents as committed there and when its
  folder first appeared on the default branch.
- **FR-002**: A document the hub already holds MUST NOT be sent again. A report for an unchanged
  default branch MUST NOT be noticeably larger or slower than today.
- **FR-003**: Reports MUST stay within spec 001's limits (FR-010). When the default branch holds more
  than fit in one report, the hub MUST receive the rest over following reports with no action by the
  developer.
- **FR-004**: Reporting finished features MUST keep spec 001's guarantees: no output in normal
  operation, never block or fail a git operation, no noticeable added delay to one, and fail open
  (FR-005 of spec 001). It MUST work with any git host and MUST NOT contact the remote (Art. 2.5).
- **FR-005**: When connected clones report different states of the default branch, the hub MUST show
  the newest one.

**The finished features list**

- **FR-006**: Each project MUST have a finished features list reachable from the board, listing every
  feature on the default branch, including those there before the project was connected.
- **FR-007**: Each listed feature MUST show its number, title, owner (by spec 001's rules, FR-015)
  and when it landed. When it landed is when the hub first saw it on the default branch or, for
  features already there when the project was connected, when its folder first appeared on the
  default branch.
- **FR-008**: Members MUST be able to narrow the list by text (title, folder name, number) and by
  owner. The narrowed list MUST be addressable, so a shared link shows the same list. The list MUST
  open with the most recently landed features first.
- **FR-009**: Opening a finished feature MUST show its spec, plan and tasks as on the default branch,
  with each document's last change time, rendered as safely as in-flight documents (FR-020 and
  FR-021 of spec 001).
- **FR-010**: A feature that is both finished and changed again on a branch MUST show on the board in
  flight as today and in the finished list; each of its pages MUST link to the other.
- **FR-011**: A feature removed or renamed on the default branch MUST leave the finished list under
  its old name from the first report that shows the change.

**The board**

- **FR-012**: The board and its views MUST keep showing only work in flight, the stale group and
  recently landed features (spec 001). Recently landed features MUST link to their finished page.

**Agents**

- **FR-013**: Members' agents MUST be able to list finished features (narrowed by text and owner)
  and read a finished feature's summary and documents, read-only, scoped to the project linked to
  the repository as for the board (FR-022 to FR-024 of spec 001).

### Key Entities

- **Finished feature**: a feature folder on the default branch. It has a number, title, owner, when
  it landed, and its documents as on the default branch. It may also be in flight on other branches.
- **Default branch snapshot**: the newest state of the default branch any connected clone has
  reported, which the finished list mirrors.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a copy of the pilot repository, every feature folder on the default branch appears in
  the finished list, with documents matching the default branch, in 100% of features checked.
- **SC-002**: A member finds a given finished feature by a word of its title or its number in under
  10 seconds in a project with 150 finished features.
- **SC-003**: After the first full upload, a commit in a clone of the pilot repository is not
  noticeably slower than before this feature, and the report for an unchanged default branch is no
  more than 10% larger than before.
- **SC-004**: A clone of the pilot repository that connects for the first time fills the finished
  list completely within its first 5 reports, without any output or action by the developer.
- **SC-005**: An agent asked "how did we specify feature N?" for a finished feature answers from the
  hub's documents, without reading the repository, in 100% of tested cases.
- **SC-006**: The in-flight board for the pilot project is unchanged by this feature: the same
  entries, groups and counts as before for the same reports.

## Annoyance budget (Art. 3.8)

No messages, prompts or output are added. The reporter stays silent; the list is something members
open when they want it. Connecting a new developer takes the same single step.

## Assumptions

- The hub keeps a cached copy of default-branch documents, as it already does for in-flight
  documents (Art. 1.1: cached snapshots of what clients report). Git remains the content store;
  losing the hub's database loses nothing that is not in the repository (Art. 1.4).
- "Landed" means on the default branch, by spec 001's rule (FR-017), whatever merge style was used.
- "Owner" for a finished feature follows spec 001: the owner header, else the first committer matched
  to a member, else their git name.
- Phase and task progress of a finished feature are shown as its tasks read on the default branch;
  a feature that landed with unticked tasks shows them as unticked. The hub does not mark anything
  done by hand (Art. 3.1).
- The finished list mirrors only the default branch. Old versions of a finished spec are in git
  history and are not kept by the hub.
- Spec 001's decision that a clone reports only unmerged work changes for the default branch: its
  contracts and research are updated when this feature is planned.
