# Feature Specification: Landing lock — one lander at a time, so a green gate stays green

**Feature Branch**: `003-landing-queue`

**Created**: 2026-10-29 · **Revised**: 2026-10-30 (agent-held lock over MCP)

**Status**: Draft

**Input**: User description: "Feature 003 — Landing queue. Teams that land to the default branch
after a long pre-land gate run on the developer's own machine (tests, builds, evals; often 20+
minutes) waste time when someone else lands while their gate is running: their result is stale and
they must rebase and run the gate again. Spec Hub adds an optional landing queue […] The hub never
runs gates and never blocks git — it only decides whose turn it is (advisory)."

Revision, 2026-10-30: "An agent takes the lock (says he wants to land); all other agents who ask
for the lock through MCP are put in a queue and notified when the original user opens the lock
again. It can also be opened manually in the dashboard UI."

## Clarifications

### Session 2026-10-30 (revision)

- Q: How is the lock held? → A: Through MCP only. An agent asks for the lock; if it is free the
  agent holds it, otherwise the agent waits in a first-come, first-served queue. The shell command
  and its background check-in from the first draft are removed.
- Q: How is a waiting agent "notified"? → A: Coding agents do not surface server-sent MCP
  notifications to the model, so the request itself waits: asking for the lock blocks for up to
  25 seconds and answers either "you hold the lock" or "position N, ask again". The tool tells the
  agent to keep asking until it holds the lock.
- Q: What if the holder crashes or forgets to open the lock? → A: The lock opens by itself 60
  minutes after the holder's last call, and any member can open it earlier on the dashboard. Any
  call from the holder renews the 60 minutes.
- Q: Who may open a lock on the dashboard? → A: Any member of the project. The action is recorded
  with who did it.
- Q: Who may take the lock? → A: Any member, with the token their agent already uses for MCP. *(Default,
  pending review: the queue is advisory, so it needs no write permission of its own.)*
- Q: One place per what? → A: Per person. A person's second agent asking for the lock gets the
  same place. *(Default, pending review.)*
- Q: Does the hub notice the land, or someone landing outside the queue? → A: No, not in this
  feature. Without a process on the developer's machine during the turn the hub cannot see the
  remote. The holder opens the lock; the timeout and the dashboard catch the rest. *(Cut, pending
  review: the first draft's automatic end and stale warning.)*

## User Scenarios & Testing *(mandatory)*

The problem: two developers start their pre-land gate against the same state of the default
branch. The first one lands; the second one's green result now describes a state that no longer
exists, so they rebase and run the whole gate again — 20 minutes or more per collision.

The lock removes the collision by making landers take turns for the gate, not for the push. The hub
does not know what the gate is or how the team lands; it only answers "may I land now?". Nobody is
affected unless they use it.

### User Story 1 - My agent takes the lock, lands, and opens it (Priority: P1)

A developer tells their coding agent to land a branch. The agent asks the hub for the landing lock.
If nobody holds it, the agent holds it at once, rebases on the current default branch, runs the
gate, lands, and opens the lock.

**Why this priority**: This is the whole feature for a team with one lander at a time.

**Independent Test**: With an empty queue, A's agent asks for the lock and holds it; B's agent then
asks and is told A holds it. A's agent opens the lock; B's next ask holds it.

**Acceptance Scenarios**:

1. **Given** nobody holds the lock, **When** A's agent asks for it, **Then** the answer says A holds
   the lock, at once.
2. **Given** A holds the lock, **When** A's agent asks again, **Then** A still holds it and the 60
   minutes start again (asking again is harmless).
3. **Given** A holds the lock, **When** A's agent opens it (landed or gave up), **Then** the lock is
   free, or held by the next person in the queue.

---

### User Story 2 - Wait in the queue and get the lock when it opens (Priority: P1)

While A holds the lock, B's and C's agents ask for it. They are queued in the order they asked. Each
ask waits up to 25 seconds and answers with the position, who holds the lock and an estimate; the
agent asks again until it holds the lock. When A opens the lock, B's next answer says B holds it.

**Why this priority**: Without the queue, a second lander has to keep checking by hand, and two
waiters race when the lock opens.

**Independent Test**: A holds the lock. B asks and is told "position 1, @A holds the lock, about N
minutes". A opens the lock. B's ask that is waiting at that moment returns "you hold the lock"
within a few seconds.

**Acceptance Scenarios**:

1. **Given** A holds the lock, **When** B asks, **Then** B's place is added at the back and the
   answer, after at most 25 seconds, gives B's position, the holder and an estimate.
2. **Given** B is first in the queue and asking, **When** the lock opens, **Then** B's waiting ask
   returns within 5 seconds saying B holds the lock.
3. **Given** B is waiting, **When** B's agent leaves the queue, **Then** the people behind B move up.
4. **Given** B is waiting, **When** B's agent stops asking for 5 minutes, **Then** B's place is
   dropped.
5. **Given** the lock opened and B is next but has not asked for 2 minutes, **Then** B is skipped
   and the next person gets the lock.

---

### User Story 3 - A stuck lock never blocks the team for long (Priority: P1)

If the holder's agent crashes or forgets to open the lock, the lock opens by itself 60 minutes
after the holder's last call. Any member can also open it from the dashboard right away.

**Why this priority**: A lock that can stick forever is worse than no lock.

**Independent Test**: A holds the lock and makes no more calls. After 60 minutes the next person
holds it, and A's next call is told the lock expired.

**Acceptance Scenarios**:

1. **Given** A holds the lock, **When** 60 minutes pass with no call from A, **Then** A's hold ends
   as "expired" and the next person gets the lock.
2. **Given** A's hold expired, **When** A's agent next calls, **Then** the answer says in one line
   that the hold expired and a land now is not protected.
3. **Given** A holds the lock, **When** any member opens it on the dashboard, **Then** the next
   person gets the lock and the history records who opened it.

---

### User Story 4 - See the queue on the dashboard (Priority: P2)

Any member opens the project's landing page and sees who holds the lock and since when, who is
waiting in what order with an estimate for each, and the last turns with how they ended. Any member
can open the lock or remove a waiting place; each such action is recorded with who did it.

**Why this priority**: The agent already tells each person what they need. The page answers "why is
my wait so long?" and is the manual way out of a stuck lock.

**Independent Test**: With a holder and two waiters, the page shows all three in order. A member
opens the lock; the first waiter's agent gets it, and the history shows who opened it.

**Acceptance Scenarios**:

1. **Given** a holder and waiting people, **When** a member opens the page, **Then** they see the
   holder, the waiting order, time waited and an estimate for each.
2. **Given** a member on the page, **When** they open the lock or remove a waiting place, **Then**
   the queue moves on and the history records the member and the time.

---

### Edge Cases

- **Hub unreachable.** The agent's MCP call fails; the agent tells the developer and the developer
  decides. The hub is advisory and never blocks a land.
- **Solo developer.** The lock is granted at once; nothing to wait for.
- **Two agents of one person.** They share the person's place: the second one's ask returns the
  same place (holding or waiting).
- **Several lands in one turn.** The lock stays held until it is opened or expires.
- **The holder's gate takes longer than 60 minutes.** Any call from the holder (asking again)
  renews the lock; an agent that cannot call during the gate should ask again before it starts a
  gate it expects to exceed an hour. *(Known limit.)*
- **Someone lands without the lock.** The hub does not notice. The queue is advisory.
- **A person waiting is removed from the project.** Their place is dropped.
- **Clock.** All timing uses the hub's clock.
- **No history yet.** Estimates use 20 minutes per turn until 3 turns have ended as landed.

## Requirements *(mandatory)*

### Functional Requirements

**The lock and its queue**

- **FR-001**: The hub MUST keep one landing lock per project, with a first-come, first-served queue
  of people waiting for it. At most one person holds the lock at a time.
- **FR-002**: A place MUST belong to one member. A member MUST have at most one live place; asking
  again MUST return that place unchanged apart from renewing it.
- **FR-003**: Only members of the project MUST be able to ask for, see, open or leave the lock and
  its queue.
- **FR-004**: The lock MUST be optional: a project or person that never uses it sees no change.
- **FR-005**: The hub MUST NOT run gates, block pushes or change anything in a repository
  (Art. 1.2). The lock is advisory.

**Taking and keeping the lock**

- **FR-006**: Asking for the lock MUST join the queue if the member has no place, and MUST wait up
  to 25 seconds for the member to hold the lock before answering with the current state.
- **FR-007**: When the lock opens, the hub MUST give it to the first waiting member who asked within
  the last 2 minutes; a waiting member who has not asked for 2 minutes MUST be passed over, and one
  who has not asked for 5 minutes MUST lose their place.
- **FR-008**: A member who was given the lock MUST pick it up (any call) within 2 minutes, or the
  lock MUST pass to the next person and the hold MUST be recorded as "skipped".
- **FR-009**: A held lock MUST open by itself 60 minutes after the holder's last call, recorded as
  "expired". Any call from the holder MUST renew it.

**Opening the lock**

- **FR-010**: The holder MUST be able to open the lock, recording it as "landed" or "released".
- **FR-011**: A waiting member MUST be able to leave the queue, recorded as "left".
- **FR-012**: Any member MUST be able to open the lock or remove a waiting place on the dashboard,
  recorded as "removed" with who did it and when.
- **FR-013**: A member whose hold expired, or whose place was removed on the dashboard, MUST be told
  so in one line on their next call (within an hour).

**Interfaces**

- **FR-014**: The MCP server MUST offer agents: asking for the lock (FR-006), opening it or leaving
  the queue (FR-010, FR-011), and a read-only view of the queue.
- **FR-015**: The dashboard MUST show the holder, the waiting order with time waited and estimates,
  and the last 20 turns with how each ended and who ended it.
- **FR-016**: Nothing MUST depend on a particular land script, gate, git host or merge style, or on
  any Spec Kit extension (Art. 2).

**Estimates**

- **FR-017**: The estimated wait MUST be the turns ahead (the current one counted as half) times the
  median length of the project's last 10 turns that ended as "landed", or 20 minutes per turn while
  fewer than 3 exist.

**Records**

- **FR-018**: Every place MUST be recorded with the member, when it was asked for, started and
  ended, how it ended, and who ended it when that was someone else.
- **FR-019**: Every lock change made on the dashboard for another member's place MUST be written to
  the project's security log.

### Key Entities

- **Place**: one member's request for the lock in a project: when it was asked for, the last call,
  and its state (waiting, holding, ended) with the outcome and who ended it.

## Annoyance Budget *(constitution Art. 3.8)*

- **People who don't use the lock**: nothing changes. No hooks, no prompts, no messages.
- **Using it with nobody ahead**: one MCP call that answers at once.
- **Waiting**: the agent repeats one call; it decides what to tell the developer.
- **No push messages.** A chat notification when the lock opens belongs to a later layer.

## Success Criteria *(mandatory)*

- **SC-001**: In a project where every lander uses the lock, no member's gate result is made stale
  by another member's land.
- **SC-002**: A waiting member who is asking gets the lock within 5 seconds of it opening.
- **SC-003**: A forgotten lock blocks the queue for at most 60 minutes, or until any member opens it.
- **SC-004**: A member who never uses the lock sees no change.
- **SC-005**: Every waiting member sees their position and an estimate within 25 seconds of asking.

## Assumptions

- **Gates run on the developer's machine** and take minutes. Teams whose gates run in hosted CI are
  better served by their git host's merge queue.
- **Default branch only**, strict one at a time; no batching, no priorities.
- **Advisory**: enforcing the lock at the git host belongs to a later layer.
- **Fixed timeouts**: 25 s per ask, 2 min to pick up, 5 min for a silent waiter, 60 min for a silent
  holder.
- **Agents ask over MCP** with 001's tokens and membership; no new permission.
- **Independent of 002.**
