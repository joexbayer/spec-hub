# Feature Specification: Mark a spec as done

**Feature Branch**: `006-hide-branch`

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "Hide a leftover branch from the board … A project member can
right-click a branch and choose 'Hide this branch'." Revised the same day after the first build was
tried on the pilot: "This hide a branch feature can hide multiple specs? I'd prefer a hide spec, or
mark as complete — we simply want to say 'this spec is done, don't show it in the overview
anymore'." Also: "a copy in the right click context menu (add icons to the context menu) so I can
copy a link to the feature."

## Context

Spec 004 (FR-014) made the reporter count a branch as carrying a feature only when one of the
feature's documents on it has text the default branch never had. A few leftovers remain that git
cannot tell from real work, and a person sees at once are done:

- a squash merge whose landing commit also edited the documents, so the kept branch holds older text
  (pilot: `106-guardrail-detector-catalogue` carries 070 and 106);
- an old branch from before the feature was finished (pilot: `070-guardrail-models`);
- an edit nobody merged and nobody will (pilot: `chore/spec-shipped-status` carries 158).

The first build hid a branch. A branch can carry several specs, and the team's question is about a
spec, not a branch: "this spec is done". This feature lets a member mark a spec as done. The mark is
tied to the spec's current document text, so it never hides new work: as soon as anyone writes new
text in that spec's documents, it shows again.

## Clarifications

### Session 2026-11-24

- Q: What else belongs in the board row's menu? → A: "Copy link" to the feature page, and icons on
  every item (FR-008).
- Q: Hide a branch, or mark a spec done? → A: Mark a spec done; branch hiding is removed (it hid
  every spec the branch carried).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Mark a spec as done (Priority: P1)

A member sees feature 106 on the board. It landed yesterday and still shows as "Implement 101/103"
because of a teammate's leftover branch. They right-click the row and choose "Mark as done". 106
leaves the overview, the work map and the MCP board for everyone. The leftover branch still counts
for any other spec it carries.

**Why this priority**: This is the whole value: the overview shows only work in progress.

**Independent Test**: Report a branch carrying features A and B; mark A done; A leaves the board,
work map and MCP board for every member; B is unchanged.

**Acceptance Scenarios**:

1. **Given** a feature carried by branches whose copies of its documents are all at their current
   text, **When** a member marks it done, **Then** it leaves the board's in-flight and stale lists,
   the work map, the dependency views and the MCP board for every member.
2. **Given** a branch carrying features A and B, **When** A is marked done, **Then** B's entry,
   phase, progress and branches are unchanged.
3. **Given** a landed feature marked done, **When** anyone views Finished or Recently landed,
   **Then** it is there as before.

---

### User Story 2 - New work shows again on its own (Priority: P1)

Someone edits the done spec's documents again on any branch. On the next report the spec is back in
the overview, with no one undoing anything.

**Why this priority**: Without it a mark could silently hide real work, which would make the board
untrustworthy (Art. 3).

**Independent Test**: Mark A done; report a copy of A whose spec, plan or tasks text differs from
every copy that was marked; A is back on the board.

**Acceptance Scenarios**:

1. **Given** A marked done, **When** any clone reports A with document text that was not marked,
   **Then** A shows again everywhere, built from the copies with new text.
2. **Given** A marked done, **When** a branch carrying A gets commits that do not change A's
   documents, **Then** A stays done.
3. **Given** A marked done, **When** a new branch appears carrying A's marked text unchanged,
   **Then** A stays done.

---

### User Story 3 - See and undo (Priority: P2)

On a done spec's page, a member sees "Marked done by @x, <when>" and an "Undo" button. Undo puts it
back on the board for everyone.

**Why this priority**: A mark affects the whole team; it must be visible and reversible.

**Acceptance Scenarios**:

1. **Given** A marked done by member M at time t, **When** anyone opens A's page, **Then** it says
   "Marked done by @M" with t, and offers Undo.
2. **Given** A marked done, **When** any member chooses Undo, **Then** A shows again everywhere and
   the mark is gone.
3. **Given** an agent asks the MCP `feature` tool about A, **Then** the answer says it was marked
   done, by whom and when.

---

### User Story 4 - Copy a link (Priority: P3)

A member right-clicks a board row and chooses "Copy link"; the feature page's address is on the
clipboard, confirmed by a short message.

### Edge Cases

- **A feature with no in-flight copies** (only landed, or not reported at all) cannot be marked; the
  menu item is not offered on rows that are not in flight or stale.
- **Copies at different texts when marking**: every text reported for the feature at that moment is
  marked; a copy with any other text brings the feature back.
- **Text returns to a marked version** (a branch reset to its old state): stays done.
- **Document text that is not reported** (a document missing on a branch) is part of the version: a
  copy that gains or loses a document is new text.
- **Its page** still opens after marking (by link, from Finished if it landed, from the MCP
  `feature` tool by its directory name) and shows the mark with Undo.
- **Two members mark the same spec at once**: one mark results; either name is fine.
- **Keyboard and touch**: the row menu opens with right-click, a long press or the keyboard's menu
  key; the feature page has a visible button.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Any member of a project MUST be able to mark a feature that is in flight or stale as
  done, from the board row's right-click menu and from a button on the feature page.
- **FR-002**: A mark MUST record every document version (spec, plan and tasks text together) the
  hub currently has for that feature, and nothing else.
- **FR-003**: While a reported copy of a feature has a marked document version, that copy MUST NOT
  count anywhere for that feature: board lists, phase, progress, owner, staleness, branch counts and
  badges, work map, dependency views, feature page versions, MCP `board` and `feature`.
- **FR-004**: A mark MUST affect only the marked feature; other features on the same branches are
  unchanged.
- **FR-005**: A copy with a document version the mark did not record MUST count as usual, with no
  action by anyone.
- **FR-006**: The hub MUST record who marked a feature and when; the feature page MUST show it and
  offer Undo; Undo removes the mark for everyone.
- **FR-007**: The MCP `feature` tool MUST say that a feature was marked done, by whom and when; MCP
  offers no way to mark.
- **FR-008**: The board row's right-click menu MUST offer "Copy link" (the feature page's address,
  confirmed) and "Mark as done"; every menu item carries an icon.
- **FR-009**: Marking MUST never change a landed feature's Finished entry, the reporter, or what
  clones report.
- **FR-010**: The constitution MUST record this as a named exception to Art. 3.1.
- **FR-011**: Marks MUST be limited to members of the project.

### Key Entities

- **Done mark**: in a project, a feature folder, the document versions it covers, the member who
  marked it, and when. Effective for a reported copy of that folder whose document version is one of
  them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the pilot, marking 070, 106 and 158 done removes exactly those three from the
  overview; every other entry is unchanged.
- **SC-002**: A done spec whose documents get new text is back on the board within one report, with
  no person acting.
- **SC-003**: A member marks a spec done in two clicks from the board.
- **SC-004**: Every mark shown in the hub names who did it and when.

## Assumptions

- "Member" means anyone with a membership in the project (admin or member role).
- The hub already stores each reported copy's spec, plan and tasks versions; nothing new is
  reported. Extra documents (`preview.md`) are not part of the version: a preview-only edit does not
  bring a done spec back.
- No notification is sent when a spec is marked done (Art. 3.2).
- Branch hiding, built and deployed earlier the same day, is removed; any hides made with it are
  dropped.
