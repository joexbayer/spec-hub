# Feature Specification: Hide a leftover branch

**Feature Branch**: `006-hide-branch`

**Created**: 2026-11-24

**Status**: Draft

**Input**: User description: "Hide a leftover branch from the board. Some branches are kept after
their work landed (a squash merge whose landing commit also edited the docs, an old branch from
before the feature was finished, a branch with a never-merged status edit). Their documents hold
text the default branch never had, so the reporter honestly reports them as carrying the feature and
the feature stays in flight, although the team knows it is done. A project member can right-click a
branch and choose 'Hide this branch'. The hide applies to that branch at its current tip for the
whole project; as soon as the branch has a new tip it shows again on its own. A hidden branch can be
seen and un-hidden from the feature page, with who hid it and when. A deliberate exception to Art.
3.1; the reporter does not change."

## Context

Spec 004 (FR-014) made the reporter count a branch as carrying a feature only when one of the
feature's documents on it has text the default branch never had. That removed deploy branches and
plain squash-merge leftovers. A few leftovers remain, and git alone cannot tell them from real work:

- a branch squash-merged where the landing commit itself also edited the documents, so the branch
  holds the older text (pilot: `106-guardrail-detector-catalogue` carries 070 and 106);
- an old branch from before the feature was finished (pilot: `070-guardrail-models`,
  `chore/guardrails-merge-main`);
- a branch with an edit nobody merged and nobody will (pilot: `chore/spec-shipped-status` carries 158).

A person sees at once that these are done. The board keeps showing them as in flight until the
branch is deleted or goes stale after 14 days. Deleting is the right fix but often not the viewer's
to make: the branch is someone else's, or nobody remembers why it exists.

This feature lets a project member hide such a branch. The hide is tied to the branch's exact tip,
so it never hides new work: one commit to the branch and it shows again.

## Clarifications

### Session 2026-11-24

- Q: What else belongs in the board row's menu? → A: "Copy link" to the feature page, and icons on
  every item (FR-013).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hide a leftover branch (Priority: P1)

A member sees feature 106 on the board, which landed yesterday and still shows as "Implement
101/103" because of a teammate's leftover branch. They right-click the row, which lists the
feature's branches, and choose "Hide 106-guardrail-detector-catalogue" (or do the same from the
feature page's branch list). The branch leaves the list; 106 leaves the board's in
flight list (it was its only non-landed carrier) and shows only under Recently landed and Finished.
Every member and every agent sees the same.

**Why this priority**: This is the whole value: the board shows only real work again.

**Independent Test**: Report a branch carrying a feature that is also on the default branch; hide
it; the feature is no longer in flight on the board, work map or MCP board, for every member.

**Acceptance Scenarios**:

1. **Given** a feature whose only carrier is branch B at tip T, **When** a member hides B, **Then**
   the feature leaves the board's in-flight list, the work map and the MCP board for every member.
2. **Given** a feature carried by B (hidden) and C (not hidden), **When** anyone views it, **Then**
   phase, progress, owner, staleness and branch count come from C alone.
3. **Given** B carries features 070 and 106, **When** a member hides B from 106's page, **Then** B
   no longer counts for 070 either.

---

### User Story 2 - New work shows again on its own (Priority: P1)

The teammate who owns the hidden branch commits to it again. The branch shows again at its new tip
on the next report, with no one undoing anything.

**Why this priority**: Without it a hide could silently hide real work, which would make the board
untrustworthy (Art. 3).

**Independent Test**: Hide B at tip T; report B at a new tip T2; B counts again everywhere.

**Acceptance Scenarios**:

1. **Given** B hidden at T, **When** any clone reports B at T2 ≠ T, **Then** that copy of B counts
   again everywhere, and the feature page no longer lists it as hidden.
2. **Given** B hidden at T and two clones report B, one at T and one at T2, **When** anyone views
   the feature, **Then** only the copy at T2 counts.
3. **Given** B was hidden at T, moved to T2, and was later reset back to T, **When** it is reported
   at T again, **Then** it is hidden again (the hide is for that exact tip).

---

### User Story 3 - See and undo hides (Priority: P2)

On a feature page, a member opens "Hidden branches" and sees each hidden branch with who hid it and
when. They choose "Show again" on one; it counts again for everyone.

**Why this priority**: A hide affects the whole team; it must be visible and reversible, or a
mistaken hide stays unnoticed.

**Independent Test**: Hide B; the feature page lists B under Hidden branches with the member's name
and time; "Show again" restores it everywhere.

**Acceptance Scenarios**:

1. **Given** B hidden by member M at time t, **When** anyone opens a feature B carries, **Then**
   "Hidden branches" lists B with M and t.
2. **Given** B hidden, **When** any member chooses "Show again", **Then** B counts again everywhere
   and the record of the hide is gone.
3. **Given** an agent asks the MCP `feature` tool about a feature with a hidden branch, **Then** the
   answer names the hidden branch, who hid it and when, apart from the counted branches.

### Edge Cases

- **Several clones, same tip**: local and remote copies (spec 004) of B at the same tip T are all
  hidden by one hide.
- **Several clones, different tips**: a hide records every tip the board shows for B at that moment;
  a copy at any other tip counts.
- **Deleted and recreated** with the same name: a new tip counts; the same tip stays hidden.
- **A hide that no longer matches anything** (the branch moved or was deleted) has no effect and is
  not listed under Hidden branches.
- **Hiding the last carrier of a feature that is not on the default branch**: the feature leaves the
  in-flight views. Its page still opens (by link, from the MCP `feature` tool by its directory name,
  or from Finished if it landed) and shows the hidden branch with "Show again".
- **The default branch** cannot be hidden: the hub refuses it, even when a clone's local default
  branch is ahead of the shared remote and so reported as a carrier.
- **Branch list on the feature page**: the version picker does not offer a hidden branch; Hidden
  branches does.
- **Landing queue** (spec 003): hiding a branch does not change the queue.
- **Two members hide the same branch at the same time**: one hide results; either name is fine.
- **Keyboard and touch**: right-click menus open with a long press, and the board row's with the
  menu key; the feature page has a visible button per branch, so every hide can be made and undone
  without a mouse.
- **A branch that moves while someone is choosing to hide it**: the hide records the tips the hub has
  when the member confirms; a commit reported in the same second may be hidden with it and shows
  again on the branch's next commit.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Any member of a project MUST be able to hide a branch that carries a feature in that
  project: from a board row's right-click menu (which lists that feature's branches), from a branch
  in the work map (right-click), and from the feature page's branch list (a visible menu button per
  branch). Right-click menus also open with a long press; the board row's also with the keyboard's
  menu key.
- **FR-002**: A hide MUST apply to the branch name together with every tip the hub currently has for
  that name in the project, and to nothing else.
- **FR-003**: While a reported copy of a branch has a hidden tip, that copy MUST NOT count anywhere:
  board in-flight list, phase, progress, owner, staleness, branch counts and badges, work map,
  dependency views, feature page versions, and the MCP `board` and `feature` tools.
- **FR-004**: A hide MUST apply to the branch for every feature it carries.
- **FR-005**: A copy reported at a tip the hide did not record MUST count as usual, with no action by
  anyone.
- **FR-006**: The hub MUST record who hid a branch and when, and the feature page MUST list the
  branch's currently effective hides under "Hidden branches" with that name and time.
- **FR-007**: Any member MUST be able to undo a hide ("Show again"); the branch then counts again
  everywhere.
- **FR-008**: The MCP `feature` tool MUST list a feature's hidden branches separately, with who hid
  each and when; it MUST NOT offer a way to hide.
- **FR-009**: Hiding MUST never change a phase, progress, owner or landed state by itself; it only
  removes a branch's report from counting.
- **FR-010**: The reporter, what clones report, and the Finished/default-branch views MUST NOT
  change.
- **FR-011**: The constitution MUST record this as a named exception to Art. 3.1: a member may hide
  a branch at a given tip; status itself stays inferred.
- **FR-012**: Hides MUST be limited to members of the project; a non-member MUST NOT be able to see
  or change them.
- **FR-013**: A board row's right-click menu MUST also offer "Copy link", which copies the address of
  the feature's page and confirms it; every menu item carries an icon.

### Key Entities

- **Branch hide**: in a project, a branch name, the tips it hides, the member who hid it, and when.
  Effective while some reported copy of that name has one of those tips.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On the pilot, after hiding the four leftover branches named above, 070, 106 and 158
  leave the in-flight list and no other feature changes.
- **SC-002**: A hidden branch that receives a new commit counts again within one report, with no
  person acting.
- **SC-003**: A member can hide a branch in two clicks from the feature page.
- **SC-004**: Every hide shown in the hub names who did it and when.

## Assumptions

- "Member" means anyone with a membership in the project (admin or member role); hiding is
  reversible and visible, so it needs no admin.
- The hub already knows each reported branch's tip commit; nothing new is reported.
- A hide that no longer matches anything is kept but not listed; it takes effect again only if the
  branch returns to that exact tip (User Story 2, scenario 3).
- No notification is sent when a branch is hidden (Art. 3.2); the record on the feature page is
  enough.
