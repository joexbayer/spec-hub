# Feature Specification: Coordination over MCP — ask, answer and check from the agent

**Feature Branch**: `002-mcp-coordination`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Feature 002 — Coordination over MCP. Spec Hub's core job is to let
people (and their coding agents) who use Spec Kit in the same repository coordinate their specs
through the hub's MCP server; the web dashboard's main jobs are letting people accept/approve a
spec and see dependencies. 002 adds the coordination layer on top of the read-only board: review
requests, an inbox, human-only approve/object bound to the reviewed content, a gate check before
plan or implement, spec number claims, agreement requests to the owners of features yours depends
on or changes, Spec Kit hook prompts at the right moments, and notifications only when someone must
act. One hub per organisation, teams are projects; the pilot is one team (4 people, ~89 specs,
rebase-merge workflow, almost all approvals today are self-approvals, no PR reviews)."

## Clarifications

### Session 2026-10-26

- Q: Which channel carries immediate messages and the digest? → A: None in this feature. People
  learn what needs them from the inbox in their agent session and on the dashboard (with a count).
  A push channel (Slack first), reminders and the daily digest come in a later layer (FR-026 to
  FR-029).

### Session 2026-10-27

- Q: What did the pilot review add? → A: Four things. (1) Claims cover any numbered sequence a
  project declares (ADRs, follow-up ids, constitution versions collide there too), not only spec
  numbers (User Story 4, FR-017a). (2) Contract lookup: an agent reads another feature's contract
  files and sees who owns them and whether they changed since that feature's plan was approved
  (User Story 9, FR-032 to FR-034). (3) A quorum: a project can require approvals from specific
  people as well as a count (FR-016). (4) The `preview.md` that Spec Kit's agentic preset writes
  during plan shows on the feature page fully rendered, Mermaid diagrams included (User Story 8,
  FR-035 to FR-038).

## User Scenarios & Testing *(mandatory)*

The people in these stories work through their coding agent; the hub's agent connection (set up in
001) is how they ask and check. The dashboard is where a person approves, objects and answers.

### User Story 1 - Ask a teammate to review my spec (Priority: P1)

A developer has just written a spec with their agent. The agent offers once: "Ask someone to review
this spec?" The developer names a teammate (or says "the owners of what this depends on"). The
reviewer finds the request in their inbox — in their own agent session and on the dashboard — opens
the exact version that was sent, and approves it or objects with a reason. The developer's agent
sees the outcome the next time it looks.

**Why this priority**: This is the gap the pilot shows: in the pilot 62 of 66 spec approvals were
self-approvals and no pull request had a review. Asking must cost one sentence to the agent.

**Independent Test**: Two members of one project. A asks B, through A's agent, to review A's spec.
B opens the request from their inbox, approves it on the dashboard, and A's agent reports the
approval with B's name and the version approved.

**Acceptance Scenarios**:

1. **Given** A has committed a spec the hub has seen, **When** A's agent asks the hub to have B
   review it, **Then** the request names the feature, the document and the exact version (the
   branch it came from and when it was committed), and B has exactly one new item waiting.
2. **Given** a review request for B, **When** B opens it on the dashboard, **Then** B sees that
   version of the document rendered, who asked, and, if B approved an earlier version, what
   changed since then.
3. **Given** B is looking at the request, **When** B approves, **Then** the approval records B,
   the time and the exact version, and A's agent sees it on its next check.
4. **Given** B is looking at the request, **When** B objects, **Then** B must give a reason, and A
   (and the feature's owner, if different) gets an item needing them at once.
5. **Given** A's agent is connected, **When** it lists what it can do, **Then** it can ask for a
   review but it cannot approve or object, for anyone, including A.
6. **Given** A asks for a review of a spec the hub has never seen (not committed yet), **Then** the
   agent is told to commit it first and no request is made.

---

### User Story 2 - What is waiting on me (Priority: P1)

At the start of a session, or whenever they ask, a developer's agent can tell them what is waiting
on them — reviews asked of them, objections on their features, agreement requests to them — and
what they are waiting on from others. The dashboard shows the same inbox, with a count in the
navigation.

**Why this priority**: Requests only work if the person asked finds them without being nagged; the
agent session is where developers already are.

**Independent Test**: With one open review request for B, one objection on B's feature and one
agreement request from B to C, B's agent lists the first two under "waiting on you" and the third
under "you are waiting on", each with who and since when; the dashboard inbox shows the same three.

**Acceptance Scenarios**:

1. **Given** B has open requests, **When** B's agent asks for the inbox, **Then** it receives one
   line per item: what, which feature, who, since when, and where to act.
2. **Given** B has nothing waiting, **When** B's agent asks for the inbox, **Then** it gets one line
   saying so.
3. **Given** B approves a request on the dashboard, **When** B's agent next asks, **Then** the item
   is gone from B's inbox and appears as answered in A's "waiting on" list.

---

### User Story 3 - Check before I plan or implement (Priority: P1)

Before the agent starts planning (or implementing) a feature, it checks with the hub whether the
spec (or the plan) has the approvals the project asks for and whether anyone has objected. When all
is well, nothing is printed. When something is missing, the developer sees one short message saying
what and from whom, and decides for themselves whether to go on. The check never stops git or Spec
Kit.

**Why this priority**: The check is what turns approvals from a ritual into something the workflow
looks at, without blocking anyone.

**Independent Test**: For a spec with no approval, the check before plan says "no approval yet" and
names the open request; after a teammate approves, the same check prints nothing.

**Acceptance Scenarios**:

1. **Given** a spec with the required approvals and no open objections, **When** the agent checks
   before plan, **Then** the check passes and nothing is shown to the developer.
2. **Given** a spec with an open objection, **When** the agent checks, **Then** the developer sees
   the objection's author and reason in one message.
3. **Given** a spec approved at an earlier version and changed since, **When** the agent checks,
   **Then** it reports "approved by B, changed since" with the version B approved; whether that
   still counts is the project's setting (FR-016).
4. **Given** only the feature's owner approved their own spec, **When** the agent checks, **Then**
   it reports a self-approval, which by default does not count toward the requirement.
5. **Given** the hub is unreachable, **When** the agent checks, **Then** the check says it could not
   check and Spec Kit carries on.

---

### User Story 4 - Claim the next spec number (Priority: P2)

When a developer starts a new feature in a project with sequential numbering, their agent claims the
next number from the hub before creating the folder. Two developers who start features at the same
time get different numbers.

**Why this priority**: Number clashes are the most common collision on the board (001 flags them
after the fact); claiming prevents them, at the cost of nothing visible to the developer.

**Independent Test**: Two members start a feature within the same minute; both claims succeed with
different numbers, each above every number the hub knows of (landed, in flight or claimed).

**Acceptance Scenarios**:

1. **Given** the highest number the hub knows of in the project is 107, **When** A's agent claims a
   number, **Then** it gets 108, and B's claim a moment later gets 109.
2. **Given** A claimed 108, **When** A's clone reports a feature numbered 108, **Then** the claim is
   fulfilled and no longer shows as a claim.
3. **Given** A claimed 108 and never used it, **When** 7 days pass, **Then** the claim lapses; the
   number is not handed out again while a higher one exists, but no longer shows as A's.
4. **Given** a project with timestamp numbering, **When** an agent asks to claim, **Then** it is told
   claiming isn't needed.
5. **Given** a project that declares an `adr` sequence for `docs/adr/NNNN-*.md` and the highest ADR
   on any reported branch is 0067, **When** A's agent claims an `adr` number, **Then** it gets 0068,
   and B's claim a moment later gets 0069.

---

### User Story 5 - Ask the owner before changing their feature (Priority: P2)

A developer's feature depends on, or changes, a feature someone else owns (for example "I'm changing
the contract in 006"). Their agent asks the owner for agreement with a short note. The owner sees
the request in their inbox and agrees or declines, with a reason when declining. The requester's
agent sees the answer.

**Why this priority**: The dependency map (001) shows who depends on what; this lets the agent act
on it instead of the developer chasing someone in chat.

**Independent Test**: A's feature changes C's landed feature 006. A's agent asks C for agreement;
C declines with a reason on the dashboard; A's agent shows "C declined: <reason>".

**Acceptance Scenarios**:

1. **Given** A's feature depends on C's feature, **When** A's agent asks for agreement, **Then** C
   gets exactly one new item naming both features and A's note.
2. **Given** an agreement request to C, **When** C declines, **Then** C must give a reason and A gets an
   item needing them at once.
3. **Given** an agreement request to C, **When** C agrees, **Then** A sees it on the next check as an
   update that doesn't count as needing A.
4. **Given** A asks for agreement on a feature A owns, **Then** the request is refused as pointless.

---

### User Story 6 - Decide on the dashboard (Priority: P1)

A reviewer opens the dashboard, sees their inbox, and for each item reads the document version that
was sent (with what changed since they last approved, if anything), then approves, objects or, for
agreement requests, agrees or declines. A feature's page shows its approvals and objections, marks
self-approvals, and shows when a document changed since it was approved.

**Why this priority**: The user named approving a spec as the dashboard's main job. It is also the
only place an approval can come from (constitution Art. 4.1).

**Independent Test**: B approves A's spec on the dashboard; the feature page then shows B's
approval with its version; A edits the spec and reports; the page shows "changed since B approved"
with the difference.

**Acceptance Scenarios**:

1. **Given** a review request for B, **When** B approves, objects or withdraws an earlier decision,
   **Then** each action is recorded with B, time, version and reason (reason required for objecting
   and withdrawing), and nothing is ever edited or deleted (Art. 4.3).
2. **Given** a feature's owner approves their own spec, **Then** the approval is labelled a
   self-approval wherever it shows (Art. 4.4).
3. **Given** a document approved at one version is later changed, **When** anyone opens the feature,
   **Then** they see the approval, the version approved, and the changes since.
4. **Given** a project whose quorum is two approvals including the owners of the features this one
   depends on, **When** only one dependency owner has approved, **Then** the feature page and the gate
   check both say which approvals are still missing, by name.

---

### User Story 7 - Only what needs me counts (Priority: P2)

A person's inbox separates what needs them — they were asked to review or to agree, or someone
objected to or declined something of theirs — from updates such as approvals, agreements and lapsed
claims. Only the first kind counts in the dashboard's badge and in what the agent mentions. Nothing
is pushed to them in this feature; a push channel comes later.

**Why this priority**: The product fails the moment people mute it (constitution Art. 3); the inbox
must not become a feed.

**Independent Test**: Over one day, B is asked for one review and A's spec gets one approval. B has
exactly one item needing action; A has none needing action and one update; C, who was not
involved, has nothing.

**Acceptance Scenarios**:

1. **Given** A asks B for a review, **Then** B has exactly one item about it, however often A asks.
2. **Given** a request is answered or withdrawn, **Then** the existing item changes state; no new
   item is added for the person who was asked.
3. **Given** a person did something themselves, **Then** it never appears as something for them.
4. **Given** an agent that can run something at session start, **When** a session starts and items
   need the person, **Then** the agent mentions them once in one line; with none, it says nothing.

---

### User Story 8 - See the plan's preview, rendered (Priority: P2)

Some Spec Kit setups write a `preview.md` next to the plan (the agentic preset does; stock Spec
Kit doesn't): code sketches and architecture diagrams, mostly Mermaid. A reviewer opens a feature on the dashboard and reads the preview fully
rendered, diagrams drawn, in the same place as the spec and plan. Their agent can read the same text.

**Why this priority**: The preview is the cheapest place to catch a wrong design, and it is what
the reviewer of a plan most needs to see; in raw Markdown the diagrams are unreadable. The pilot has
a preview for 69 features, 68 of them with Mermaid diagrams.

**Independent Test**: A feature whose plan folder holds a `preview.md` with one flowchart and one
sequence diagram shows a Preview tab with both diagrams drawn; a feature without one shows no tab.

**Acceptance Scenarios**:

1. **Given** a reported feature with `preview.md`, **When** anyone in the project opens it, **Then**
   a Preview tab shows the rendered Markdown with its Mermaid diagrams drawn, in light and dark.
2. **Given** a diagram that does not parse, **Then** that diagram shows as its source with a short
   note, and the rest of the preview renders.
3. **Given** a preview containing links, HTML or diagram click handlers, **Then** none of them can
   run script or load anything from outside the hub.
4. **Given** an agent asks for a feature's preview, **Then** it gets the text the same way it gets the
   spec, plan and tasks.

---

### User Story 9 - Read the contract I depend on (Priority: P2)

A developer's agent is planning a feature that depends on another feature's interface. It asks the
hub for that feature's contract files (the `contracts/` folder Spec Kit's plan writes), reads them,
and sees who owns them and whether they changed since that feature's plan was approved.

**Why this priority**: Agents keep reading other features' contracts (the pilot has 81 contract
folders), and a contract that changed after approval is a recurring failure there.

**Independent Test**: C's feature 006 has `contracts/lease.md`; A's agent lists 006's contracts,
reads `lease.md`, and is told C owns it and that it changed after 006's plan was approved.

**Acceptance Scenarios**:

1. **Given** a feature with contract files, **When** an agent lists them, **Then** it gets each file's
   name, size and last change, and the feature's owner.
2. **Given** a contract that changed after the feature's plan was last approved, **When** an agent
   reads it, **Then** the answer says so and when.
3. **Given** a name not among the feature's contracts, **Then** the agent is told which names exist.

### Edge Cases

- **The feature is on several branches with different versions**: a request pins the version from
  the requester's own most recent report; if the requester has none, the most recent version on any
  branch. The request states which branch and commit time it pinned.
- **The document changes while a review is open**: the request stays pinned to the version that was
  sent; the reviewer sees that a newer version exists and can approve either.
- **The feature lands on the default branch**: its requests, approvals and objections stay with it;
  landing does not close open requests by itself.
- **A reviewer is removed from the project**: their open requests close as "reviewer left", and the
  requester sees that. Decisions they already made stay in the record.
- **A request to someone outside the project, or to nobody**: refused with the reason.
- **Asking the same person twice for the same document**: the existing open request is returned
  instead of a new one (no second message).
- **Asking oneself to review**: refused; a self-approval is made on the dashboard and labelled as
  such.
- **A claimed number appears on someone else's branch first**: 001's collision flag shows it; the
  claim stays with the claimer.
- **Number claims racing**: two claims at the same moment never get the same number.
- **A feature folder is renamed after approval**: approvals follow the feature (same number and
  owner), and the rename shows as a change since approval.
- **An objection on a version that has since changed**: it stays open until its author withdraws it
  or approves a newer version.
- **Two sequences share a pattern, or a pattern matches nothing**: the configuration is refused with
  the reason; a sequence with no matching file starts at 1.
- **A preview or contract too large to show**: the hub says so and points at the repository, as for
  other documents (001).
- **A preview edited after the plan was approved**: it shows "changed since" like the plan, but it
  doesn't count toward approvals on its own.
- **The hub is unreachable**: every agent-side check says it could not check, prints nothing else,
  and never blocks the Spec Kit command (Art. 3.6).

## Requirements *(mandatory)*

### Functional Requirements

**Review requests**

- **FR-001**: A member MUST be able to ask one or more other members of the project, by GitHub
  login, to review a feature's spec or plan, from their agent or from the dashboard, with an
  optional note of up to 500 characters.
- **FR-002**: A request MUST be able to name "the owners of the features this one depends on"
  instead of logins; the hub resolves them to members and says who was asked.
- **FR-003**: A request MUST pin one exact version of the document the hub has seen (see Edge
  Cases), and state which branch and commit time that version came from. A document the hub has
  not seen MUST be refused with "commit it first".
- **FR-004**: Asking someone who already has an open request for the same document MUST return that
  request instead of creating another. Asking oneself or a non-member MUST be refused.
- **FR-005**: The requester MUST be able to withdraw an open request; the reviewer then no longer
  sees it as waiting.

**Decisions (human only)**

- **FR-006**: Approving, objecting, agreeing, declining and withdrawing a decision MUST be possible
  only for a signed-in person on the dashboard. No agent capability and no token can do any of
  them, for anyone (Art. 4.1).
- **FR-007**: Every decision MUST record the person, the time, the exact document version and, for
  objections, declines and withdrawals, a reason. Decisions are append-only; a correction is a new
  decision (Art. 4.3).
- **FR-008**: A member MUST be able to approve or object to a feature's spec or plan without having
  been asked. Approvals by the feature's owner MUST be labelled self-approvals everywhere they show
  (Art. 4.4).
- **FR-009**: The dashboard MUST show, for a document with a previous decision by the viewer, what
  changed between the version they decided on and the version in front of them.
- **FR-010**: A feature's page MUST list its approvals and open objections per document, with
  person, version, time, self-approval label, and "changed since" when the current version differs
  from the approved one.

**Inbox**

- **FR-011**: A member MUST be able to see, from their agent and on the dashboard, what is waiting
  on them (review and agreement requests to them; open objections and declines on their features
  and requests) and what they are waiting on (their open requests and claims), each with feature,
  person, age and where to act.
- **FR-012**: The dashboard MUST show the number of items waiting on the viewer in its navigation.

**Gate check**

- **FR-013**: An agent MUST be able to check a feature before plan (looks at the spec) or before
  implement (looks at the spec and the plan) and get: whether it meets the project's approval
  requirement, the counting approvals, self-approvals, open objections, open requests, and
  "changed since" details.
- **FR-014**: The check MUST be advisory: it never fails a git command or a Spec Kit command.
- **FR-015**: When the check passes, the developer MUST see nothing; when it doesn't, at most one
  message.
- **FR-016**: A project MUST be able to set in its committed configuration (Art. 2.3) a quorum per
  document kind (spec, plan): how many approvals a document needs (default 1); which approvers it
  must include, if any (the owners of the features it depends on, any project admin, or named
  members; default none); whether a self-approval counts (default no); whether an approval still
  counts after the document changed (default yes, shown as "changed since"). A project with no
  configuration uses the defaults. Wherever the quorum is not met, the hub MUST name what is
  missing.

**Number claims**

- **FR-017**: In a project with sequential numbering, a member's agent MUST be able to claim the
  next number: one above the highest number the hub knows of in the project (landed, in flight on
  any branch, or claimed). Concurrent claims MUST get different numbers.
- **FR-018**: A claim MUST be fulfilled when a report from the claimer shows a feature with that
  number, can be released by the claimer, and lapses after 7 days. A lapsed number is not handed
  out again while a higher number exists.
- **FR-017a**: A project MUST be able to declare further numbered sequences in its committed
  configuration, each with a name, a file pattern locating its numbers in the repository (for
  example `docs/adr/NNNN-*.md`) and its width. Reports MUST carry the numbers each sequence's pattern
  finds on every branch, and claims for a sequence MUST follow FR-017 and FR-018, with "fulfilled"
  meaning a file with that number appears.
- **FR-019**: In a project with timestamp numbering, a claim MUST answer that claiming isn't needed.

**Agreement requests**

- **FR-020**: A member MUST be able to ask the owner of another feature for agreement, with a note
  of up to 500 characters, naming their own feature and the other one. The owner must be a member.
  Asking about a feature one owns MUST be refused.
- **FR-021**: The owner MUST be able to agree or decline (with a reason) on the dashboard; the
  requester sees the answer from their agent and on the dashboard.

**Agent integration**

- **FR-022**: The agent capabilities for this feature are: ask for a review, withdraw a request,
  read the inbox, check the gate, claim and release a number in any sequence, ask for agreement,
  list and read contracts, read the preview. Each MUST act as
  the token's person only, within projects they belong to, and validate and bound every argument.
- **FR-023**: Capabilities that change state MUST need a token permission for coordinating, which
  new tokens get by default alongside reading. A read-only token can still read the inbox and check
  the gate.
- **FR-024**: The Spec Kit extension MUST offer, as optional prompts, to ask for a review after a
  spec or plan is written, and MUST run the gate check before plan and before implement. No Spec Kit
  command gets more than one extra prompt (Art. 3.5), and none fail because of the hub (Art. 3.6).
- **FR-025**: The extension MUST claim the number before a new feature folder is created in a
  sequentially numbered project, and fall back to Spec Kit's own numbering, silently, when the hub
  can't be reached.

**Contracts**

- **FR-032**: Reports MUST carry the files in each feature's `contracts/` folder, within the same size
  limits and private-path rules as other documents (001).
- **FR-033**: An agent MUST be able to list a feature's contract files and read one, getting its
  text, the feature's owner and its last change; the text is framed as data, as other documents are.
- **FR-034**: A contract read MUST say when the file changed after the feature's plan was last
  approved, and when.

**Preview**

- **FR-035**: Reports MUST carry each feature's `preview.md` when present, within the same limits.
- **FR-036**: The feature page MUST show a Preview tab when a preview exists: full Markdown with
  tables, code and Mermaid diagrams drawn, in both themes; a diagram that fails to parse shows as
  its source with a note.
- **FR-037**: Rendering MUST NOT let preview content run script, use diagram click handlers, or
  load anything from outside the hub, the same rule as for other documents (001).
- **FR-038**: An agent MUST be able to read the preview's text the way it reads the spec, plan and
  tasks.

**Stock Spec Kit**

- **FR-039**: Everything in this feature MUST work in a repository that uses stock Spec Kit with no
  other extension or preset than Spec Hub's own: no `Owner` or `Depends on` line, no `preview.md`,
  no `contracts/` folder, Spec Kit's own task format. What an optional convention adds (dependency
  owners as reviewers, the Preview tab, contract lookup) is simply absent without it, never an
  error or a broken page.

**What needs whom**

- **FR-026**: An item MUST count as needing a person when they are asked to review, asked for
  agreement, or face an objection to their feature or request or a decline of their request.
  Approvals, agreements, withdrawals and lapsed claims MUST show as updates that don't count.
- **FR-027**: Each request MUST produce exactly one inbox item per person asked; answering or
  withdrawing changes that item's state instead of adding another. Nobody gets an item about their
  own action.
- **FR-028**: Where the agent supports running something at session start (an optional extra,
  Art. 2.4), the extension MUST mention items needing the person once per session in one line, and
  say nothing when there are none or the hub can't be reached.
- **FR-029**: This feature MUST NOT send messages outside the agent session and the dashboard. Push
  messages, reminders and a daily digest are a later layer.

**Record and access**

- **FR-030**: Requests, decisions, claims and agreement answers MUST be recorded with actor and
  time and be visible to project members on the feature's page; security-relevant events (refused
  attempts to act for others) go to the project's security log (001 FR-031).
- **FR-031**: Every capability MUST be authorized against project membership (001 FR-030); a
  removed member's open requests close as "left the project".

### Key Entities

- **Document version**: one exact content of a feature's spec or plan, as reported by a clone, with
  its branch and commit time. Requests and decisions point at one.
- **Review request**: who asked whom to review which document version, with a note, state (open,
  answered, withdrawn, closed) and age.
- **Decision**: approval, objection or withdrawal by one person on one document version, with
  reason where required; append-only; marks self-approvals.
- **Agreement request**: who asked which feature's owner about which of their own features, the
  note, and the answer (agreed or declined with reason).
- **Number claim**: a number in a project held by a member, with claimed time and state (held,
  fulfilled, released, lapsed).
- **Approval policy**: a project's quorum per document kind (count, required approvers),
  self-approval rule and change rule, from its committed configuration.
- **Sequence**: a named run of numbers in the repository (spec numbers, ADRs, follow-up ids), with
  the pattern that locates them; claims belong to one sequence.
- **Contract file** and **preview**: further documents of a feature, versioned like the spec and plan.
- **Inbox item**: one request as seen by one person, with whether it needs them or is an update,
  and its state; one per person per request.

## Annoyance Budget *(constitution Art. 3.8)*

- A person with nothing to act on gets **zero** messages: this feature sends none, and the
  session-start line is silent when nothing needs them (FR-028, FR-029).
- A review request produces **exactly one** inbox item per reviewer and no reminders (FR-027).
- Spec Kit commands get at most **one** extra prompt: the review offer after specify or plan; the
  gate check is silent when it passes and the number claim is always silent (FR-024, FR-025).
- Joining stays under **2 minutes**: no new setup step — the existing token and extension gain the
  new capabilities.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Asking for a review takes one sentence to the agent and under 10 seconds end to end;
  the reviewer can find it in their inbox within 1 minute.
- **SC-002**: A reviewer goes from opening the request to a recorded decision in under 2 minutes
  for a typical spec, without leaving the dashboard.
- **SC-003**: In the pilot's first month, at least half of new specs get an approval from someone
  other than their owner (today: 4 of 66).
- **SC-004**: Zero spec-number clashes between features started after the extension claims numbers.
- **SC-005**: No agent path can record an approval, objection, agreement or decline: verified by
  trying every agent capability with every token permission.
- **SC-006**: The gate check adds under 1 second to plan and implement, and prints nothing in at
  least 9 of 10 runs on an approved feature.
- **SC-007**: Over a working week, a person not involved in any request has zero items needing
  them and sees no session-start line.
- **SC-008**: Zero ADR-number clashes in the pilot between ADRs started after the `adr` sequence is
  declared.
- **SC-009**: Every pilot preview with Mermaid diagrams renders with its diagrams drawn, and none of
  the pilot's 69 previews fails to render as a whole.

## Assumptions

- Builds on 001: reports carry each feature's documents, so the hub already knows every committed
  version; members, tokens and the agent connection exist; the dashboard has feature pages.
- "Owner" is 001's feature owner (the `Owner` header, else the author of the spec's first commit).
  An owner who isn't a member can't be asked for agreement; the request is refused with that
  reason.
- The approval policy keys live in the extension's committed configuration file from 001; its
  defaults are those in FR-016.
- Approvals concern Spec Kit documents (spec and plan). Tasks and code review stay in the git host.
- The gate is advisory in this feature. A hard merge gate (commit status) comes with the GitHub App
  in a later layer and will read the same approvals.
- Out of scope: push messages (Slack first), reminders, the daily digest and working hours (next
  layer); "your dependency landed" messages, chat-integration buttons for approving, AI
  summaries of changes, the merge gate, approving from the agent in any form.
- One hub per organisation; everything here is per project.
