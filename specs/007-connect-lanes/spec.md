# Feature Specification: Connect in two lanes, with troubleshooting

**Feature Branch**: `007-connect-lanes`

**Created**: 2026-11-25

**Status**: Draft

**Input**: User description: "The connect flow is really confusing. One time setup vs new developer.
Make this a lot clearer, different lanes, and help with possible failures (Claude not seeing the
token for MCP etc)."

## Context

The Connect page (spec 001 FR-032) is one checklist: sign in, create a token, connect this clone,
connect your agent. The repository setup that one person does once (add the extension, link it to
the project, add the agent server, commit) is hidden in a "First time in this repository?" fold
inside step 3, and the agent step offers five ways to configure Claude Code, two of which a team
with the extension should not use (a personal `claude mcp add` entry overrides the team's
`.mcp.json` and keeps a stale token). Nothing says what to do when a step fails; the most common
failure seen on the pilot is Claude Code not getting the token for the MCP server.

## Clarifications

### Session 2026-11-25

- Q: Should the agent step tick itself from the hub's own record of MCP calls? → A: Yes; the manual
  "Done" button goes away (FR-006).
- Q: Layout? → A: Lane tabs over the steps; troubleshooting in a side panel (below on phones).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new developer joins a repository that is already set up (Priority: P1)

A developer is added to the project and opens Connect. The hub has already had reports for this
project, so the page opens on "Connect yourself": create a token, run one command in your clone,
open Claude Code and approve the spec-hub server. Nothing about installing or committing
anything.

**Why this priority**: This is the case for every person after the first; it must be the short path.

**Independent Test**: With a project that has had a report, a member who has no clone opens Connect;
the page shows the "Connect yourself" lane with three steps and no repository setup commands.

**Acceptance Scenarios**:

1. **Given** a project that has received a report from any member, **When** a member opens
   Connect, **Then** the "Connect yourself" lane is shown.
2. **Given** the lane, **Then** it has three steps: create a token, connect this clone, check your
   agent; and each step ticks itself when the hub sees it happen (FR-006).
3. **Given** the agent step with Claude Code chosen, **Then** it says there is nothing to configure
   when the repository is set up: start Claude Code in the clone, approve the `spec-hub` server when
   asked, and ask "What is the team working on?".

---

### User Story 2 - The first person sets up the repository (Priority: P1)

The first member opens Connect for a project that has never had a report. The page opens on "Set
up the repository": add the extension, link it to the project, (only if the repository manages its
own hooks) install the hooks there, add the agent server and allow its tools, then commit those
files. At the end it points them to "Connect yourself" for their own clone.

**Why this priority**: Without it no one can connect; it is done once and must be clearly separate.

**Independent Test**: With a project that has never had a report, open Connect; the "Set up the
repository" lane is shown, ends with one commit command listing exactly the files the earlier steps
created, and links to the other lane.

**Acceptance Scenarios**:

1. **Given** a project with no reports, **When** a member opens Connect, **Then** the "Set up the
   repository" lane is shown.
2. **Given** either lane, **When** the member picks the other one, **Then** it is shown; the choice
   is never locked.
3. **Given** the setup lane, **Then** it says plainly that this is done once per repository by one
   person, and that everyone else only follows "Connect yourself".

---

### User Story 3 - Something does not work (Priority: P1)

A developer ran connect, but Claude Code shows no spec-hub tools, or `/mcp` shows spec-hub as
failed. The Connect page has a "Troubleshooting" section listing what they see, why, and the exact
command that fixes it. One reporter command (`status`) checks the clone and the agent setup and
says what is wrong.

**Why this priority**: The user reports this as the main source of confusion.

**Independent Test**: For each failure in FR-008, the troubleshooting section names the symptom
and a fix with a copyable command; `status` reports the agent setup problems in FR-009.

**Acceptance Scenarios**:

1. **Given** Claude Code was started before connect stored the token, **When** the developer looks
   up "spec-hub shows failed", **Then** the fix says to reconnect it from `/mcp` (or restart).
2. **Given** the developer declined the project server prompt, **When** they look up "no spec-hub
   tools", **Then** the fix gives the command that asks again.
3. **Given** a personal spec-hub entry overrides the team's, **Then** the fix shows how to see which
   entry is used and remove the personal one.
4. **Given** a clone whose `.mcp.json` points somewhere other than this project's hub, **When** the
   developer runs `status`, **Then** it says so and gives the expected address.

### Edge Cases

- **Second clone or worktree**: worktrees share the clone's connection (nothing to do); a separate
  clone on the same machine runs connect and is not asked for the token again. The lane says so.
- **Repository set up but not on the developer's branch yet** (setup not merged): connect fails
  with "no hub configured"; troubleshooting says to pull the branch that has the setup.
- **Repository manages its own hooks** (`core.hooksPath`): the setup lane's hooks step is marked
  "only if"; connect itself prints the instruction when the hooks are missing.
- **Token revoked**: connect clears a rejected token and asks for a new one; troubleshooting says
  to create a new token and run connect again; the agent then needs a reconnect.
- **Other agents** (VS Code, Cursor, any MCP client): per person, in the agent step of "Connect
  yourself", not in repository setup.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Connect page MUST offer two lanes: "Set up the repository" (once per repository,
  one person) and "Connect yourself" (each developer, each clone), each with its own numbered steps.
- **FR-002**: The page MUST open on "Connect yourself" when the project has received a report from
  any member, and on "Set up the repository" otherwise; the member MUST be able to switch.
- **FR-003**: "Set up the repository" MUST list: add the extension, link it to the project (the
  config file contents), install the hooks in the repository's hooks directory (marked as only when
  it sets one), add the agent server (`spec-hub mcp`), allow its tools (`.claude/settings.json`),
  and one commit command naming those files; it MUST end by pointing to "Connect yourself".
- **FR-004**: "Connect yourself" MUST list: create a token, connect this clone (one command, ticked
  when the hub has a report from this member's clone), check your agent.
- **FR-005**: The agent step MUST default to Claude Code with no configuration to copy when the
  repository is set up (start Claude Code in the clone, approve `spec-hub`, ask the board question);
  VS Code, Cursor and other clients keep their per-person instructions. The page MUST NOT offer a
  personal `claude mcp add` entry or a token-in-environment `.mcp.json` for Claude Code.
- **FR-006**: The agent step MUST tick itself when the hub sees an MCP call from this member to
  this project, and say when it last saw one; there is no manual "Done" button.
- **FR-007**: The page MUST say that worktrees need nothing and a second clone only runs connect
  (no new token).
- **FR-008**: The page MUST have a Troubleshooting section, each entry a symptom, its cause and a
  fix with copyable commands where there is one, covering at least: connect says no hub is
  configured; the connect script is missing; connect says the token was rejected; nothing appears
  on the board after connect; the hooks are team-managed and missing the line; Claude Code lists no
  spec-hub server or tools (not on this branch, prompt declined, started before connect, personal
  entry overrides it); spec-hub shows failed in `/mcp` (how to run the token helper by hand and read
  its message).
- **FR-009**: The reporter's `status` command MUST also report the agent setup: whether `.mcp.json`
  has the spec-hub server, whether its address is this project's hub, and whether a token is stored
  for the hub; each problem with the command that fixes it. It stays offline.
- **FR-010**: The README and the extension README MUST describe the two lanes and point to
  `status` for problems.

### Key Entities

- **Membership** gains "agent last seen": when the hub last saw an MCP call from this member to
  this project (updated at most once a minute).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer joining a set-up repository sees only three steps and no install or
  commit commands.
- **SC-002**: Each failure listed in FR-008 has a fix on the page that a developer can apply
  without asking a teammate.
- **SC-003**: `status` names the problem for a clone with no `.mcp.json` entry, a wrong address,
  or no token.

## Assumptions

- The pilot's teammates already have the repository set up (ai-gateway): they use "Connect
  yourself" only.
- "The project has received a report" uses data the hub has (any clone of the project). A setup
  that is committed but not yet reported defaults to the setup lane; switching is one click.
- Troubleshooting text describes Claude Code's documented behaviour at the time of writing.
