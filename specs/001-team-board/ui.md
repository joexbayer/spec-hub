# UI Design: Team board

The web app's screens, the parts they are built from, and the graph views. It belongs with
[plan.md](plan.md).

**Provenance rule (constitution Art. 6)**: the Shadcnblocks admin kit
(a licensed local copy that is not part of this repository, live at shadcnblocks-admin.vercel.app) is a **design reference
only**:
- Its license forbids redistributing it "in a tool or template".
- We copy layouts, density and patterns by looking at them, and write every component ourselves on
  MIT shadcn/ui primitives, `@xyflow/react` and shadcn charts.
- No file, and no code excerpt, from the kit enters this repository.

## Look and feel

- **Layout**: a collapsible left sidebar and a slim sticky top bar, as in the kit's admin shell
  (`apps/web/src/components/layout/`).
  - The sidebar holds a project switcher (initials mark, name, `slug · role`), grouped navigation
    with icons and active states (Board: Overview with the in-flight count, Pipeline, Work map,
    Dependency map; Project: Connect, Admin; Account: Tokens, Hub projects), and the user menu at the
    bottom. It collapses to icons, with tooltips; on phones it is a sheet.
  - The top bar holds breadcrumbs (project / page / feature number), a ⌘K search over features and
    a theme toggle.
- **Page header** (`PageHeader`): title, one-line description, and right-aligned actions or view
  tabs.
- **Cards inside cards** (`Panel`, `PanelHeader`, `PanelBody`): as in the kit's
  `payment-processor/dashboard-2`, content sits in a bordered inner card on a muted outer panel
  whose header row carries the title, a count, a description and actions (filters, toggles).
  Stat tiles (`StatStrip`) use the same frame: label and icon, the number, a context line such as
  "2 of 4 implementing", and an optional footer line inside the frame.
- **Empty states** (`EmptyState`): an icon tile, a short title and one line of copy, sometimes an
  action. Every list, table and graph has one.
- **Tables**: muted header row, row hover, fixed widths for narrow columns while the title takes the
  rest and truncates, a toolbar (filter text, owner, phase) in the panel header, avatars in cells.
- **Typography and colour**:
  - Fonts are Geist Sans and Geist Mono (OFL), served from the app's own files: the security policy
    allows `font-src 'self'` only.
  - The layout is dense with a neutral (achromatic) palette; light and dark are both designed. The
    outer panel colour is the `--panel` token.
  - Colour carries phase and state only, and never alone: every coloured state also has a label or
    an icon.
- **Phase colours**: tokens in `apps/web/src/index.css` under `@theme`, defined in OKLCH.

| Token | Phase or state | Hue |
|---|---|---|
| `--phase-specify` | Specify | neutral |
| `--phase-clarify` | Clarify | amber |
| `--phase-plan` | Plan | sky |
| `--phase-tasks` | Tasks | indigo |
| `--phase-implement` | Implement | violet |
| `--phase-implemented` | Implemented | emerald |
| `--phase-landed` | Landed | green, muted |
| `--state-blocked` | blocked | red |
| `--state-collision` | number collision | orange |
| `--state-unknown` | unknown dependency | neutral, dashed outline |

## Shared parts (all ours, in `apps/web/src/components/`)

| Part | What it shows | Used in |
|---|---|---|
| `FeatureCard` | Number, last change and owner avatar, title, phase badge and state badges (`FeatureStateBadges`: blocked, collision, not pushed, change to a landed feature, open clarifications), task progress bar. Blocked and colliding cards get a tinted border. Comes in two sizes. | Pipeline and map nodes |
| `PhaseBadge`, `PhaseStepper` | One phase as a tinted chip / the seven phases as a numbered stepper with connecting lines. | Everywhere / feature page |
| `StatTile`, `StatStrip` | Label and icon, a big number and a context line, inside the nested-card frame, with an optional footer line. | Board, feature |
| `Panel`, `PageHeader`, `EmptyState` | The nested-card section frame, the page header, and the empty state described above. | Every page |
| `GraphLegend` | A strip under each canvas explaining its edge and node styles. | All graphs |
| `PersonChip` | Avatar, `@login` and the time of the last report. | Work map, feature rail, members |
| `InspectorPanel` | A right-hand panel showing the selected graph node, as in the kit's `payment-workflow`: icon, title and directory, then "Selected feature" fields, blockers, branches and "Open feature". On phones it covers the canvas. | Pipeline, work map, dependency map |
| `Document` | Sanitized markdown with lazy mermaid (research R9). | Feature tabs |
| `CopyBlock` | A command or token with a copy button. Tokens get a "shown once" warning. | Connect, tokens, admin settings |
| `AuthFrame` | The centered card outside the shell: brand mark, icon, title, description. | Sign in, waiting |
| `GraphCanvas` | Our wrapper around `ReactFlow`. Read-only (`nodesDraggable={false}`, `nodesConnectable={false}`), with zoom controls and `fitView`, and keyboard-focusable nodes. | All four graphs |

## Screens

### Board — `/p/$slug` (User Story 2; references: `payment-processor/dashboard-2`, `project-management/issue-kanban-1`)

1. **Header**: "What the team is working on", with the project's name, the in-flight count and when
   the board was last fetched.
   - A view switch with icons: List | Pipeline | Work map (`?view=`); the sidebar links to the same
     views.
   - A button that goes to the dependency map.
2. **Stat strip**, full width, one nested frame:
   - In flight, Implementing (tasks done in total out of the total count), Needs clarification, Not
     pushed, Blocked and Collisions, each with an icon (tinted when the count is not zero) and a
     context line.
   - In its footer, a stacked phase bar (shadcn chart) with a legend of counts per phase. There is
     no history to draw trends from in layer 1, so nothing pretends otherwise.
3. **Main area**, by view:
   - **List**: a panel "Features in flight" with a toolbar (filter text, owner, phase) and a table
     (TanStack Table), newest change first. Each row shows number and title, the branch count and
     state badges, owner avatar, phase, task progress and last change. The stale group is a
     collapsed row at the bottom of the same panel.
   - **Pipeline**: graph 1 below, full width, in a framed canvas with a legend.
   - **Work map**: graph 2 below, full width, in a framed canvas with a legend.
4. **Right rail** (beside the list; below the graph views, in three columns, so the canvases get the
   width):
   - **Needs attention**: collisions, blocked features, and stale features, each with a tinted
     icon tile and a link to the feature.
   - **Recently landed**: a list like the kit's "Recent payments".
   - **Team**: each member with an avatar, an in-flight count bar and the time of their last
     report, or "Not connected yet", so a member who hasn't connected is visible.

### Dependency map — `/p/$slug/map` (User Story 6; reference: `project-management/dashboard-4` "Project Dependency Map")

- **Canvas**: graph 3 in a framed panel. Its header holds the filters: owner (select), phase
  (checkbox menu), and "Show landed" / "Show stale" switches. A legend sits under the canvas.
  Selecting a node fills the inspector.
- **Right rail**:
  - A phase-health donut (shadcn chart) with the in-flight total in its centre: counts per phase
    plus blocked.
  - A **critical path** timeline, ordered dependency first. Each item shows its phase and owner, and
    clicking it centers the node.
  - Dependency cycles, when there are any.

### Feature — `/p/$slug/f/$dir` (User Stories 2 and 6; reference: `project-management/project-detail-2`)

1. Breadcrumb in the top bar (project / Board / 112); the number and directory, the title, and
   chips: phase, owner, carried-on branches (a select when there are several), not pushed,
   collision, change to a landed feature.
2. **Stat strip**: Tasks n/m (with a progress ring), open clarifications, documents present (n of
   3), branches, last change; its footer reads "Delivery: n% of tasks done", how many people carry
   it, and the branch shown.
3. `PhaseStepper` in a panel.
4. **Tabs** (underlined, with icons):
   - Spec, Plan, Tasks: each renders the document with `Document`. Tasks render as read-only
     checkboxes. A document that is too large or unreadable gets a notice instead.
   - **Versions**: graph 4a.
   - **Dependencies**: graph 4b.
5. **Right rail**, a full-height column with sections:
   - People: the owner, and everyone carrying a branch, with how many branches each carries.
   - Time: when the hub first saw it, and the last change.
   - Documents: short content ID, size and flags for each document.

### Connect — `/p/$slug/connect` (User Story 4; references: the `payment-workflow` checklist panel, `developers/api-keys`)

A page header "Connect <project>", then a four-step checklist panel with "n of 4 done" and a progress
bar in its header, and a "What you get" panel beside it. Steps are numbered circles joined by a line;
each shows a tick when it's done, and the page polls for progress:
1. **Signed in.** Done on arrival.
2. **Create a token.** Opens a dialog that shows the token once, with a copy button.
3. **Connect this clone.** A `CopyBlock` with `sh .specify/extensions/spec-hub/scripts/spec-hub
   connect`. It ticks when the hub stores this person's first report, "3 features reported".
4. **Connect your agent.** A `CopyBlock` with `claude mcp add …`, with the slug and token filled in.
   It's marked done when the developer clicks "Done", since the hub can't tell an MCP call apart
   from a report.

A footer shows how long the whole thing took, to support SC-003. "For your team admin" (install
command and config snippet) is a collapsed panel below.

### Tokens — `/tokens` (FR-029; reference: `developers/api-keys`)

- A page header with "Create token", a callout ("A token acts as you"), and a panel with a table of
  name (with a key icon), start (`sh_ab12…`), created and last used (a dot shows whether it was ever
  used). An empty state offers to create the first token.
- "Create token" opens a dialog that shows the token once, with a copy button.
- "Revoke" opens a confirmation dialog.

### Project admin — `/p/$slug/admin` (User Story 5; references: `project-management/member-list-1`, `developers/events-&-logs`, the settings form)

- **Members** tab:
  - a table with avatar, `@login` (the member's current login), role (a select), and a remove
    button, and a "pending" badge until that GitHub account first signs in; rows are addressed by
    GitHub account id;
  - an "Add member" form: a GitHub username field with suggestions from people who have signed
    in and are not members yet (`GET /api/people`, waiting people marked), and a role select. Any
    username works, signed in or not; "no GitHub user @x" and "couldn't reach GitHub" show inline;
  - the last admin can't be removed or demoted.
- **Security log** tab: a paginated table of time, actor, type and details.
- **Settings** tab: name, default branch, numbering, plus the read-only `spec-hub-config.yml`
  snippet and the extension install command.

The three tabs are underlined tabs with icons; members and the security log are panels with tables,
settings are two panels (General; Repository setup).

### Hub admin projects — `/admin/projects` (FR-027; reference: `project-management/project-list-1`)

A panel per project (initials mark, name, slug, and a strip of members, in flight and default
branch) and a "Create project" dialog in the page header. Below them,
"Waiting for access (N)": a table of people who signed in but are in no project, each with a
project select and an "Assign" button (as member).

### Waiting for access — any path, while `me.waiting` (FR-025)

Replaces the whole app shell (no sidebar, no project data) for a signed-in person who is not a hub
admin and in no project: a centered card (`AuthFrame`) "Waiting for access", their `@login` large enough to read
out to an admin, "Once you're added, reload this page", and a "Sign out" button. Other paths
redirect to `/`.

### Sign in — `/sign-in`

A centered card (`AuthFrame`) with "Sign in with GitHub". Any GitHub account can sign in; one
that belongs to no project lands on the waiting page. A failed OAuth round trip comes back with
"Signing in with GitHub didn't complete. Try again."

## Graph views (`apps/web/src/features/graphs/`)

All of them:
- take their nodes and edges from `packages/core` functions over the one board response;
- lay out with `@dagrejs/dagre`, except the pipeline, which uses fixed columns;
- use our custom node types;
- are read-only.

Selecting a node fills `InspectorPanel`, and double-click opens the feature.

| # | Graph | Nodes | Edges | Layout |
|---|---|---|---|---|
| 1 | **Pipeline** (board view) | One lane per phase, plus a final "Recently landed" lane: a muted frame with the phase dot, name and count, as tall as the fullest lane, and "Nothing here" when empty. `FeatureCard` nodes inside each lane, newest change first. | Dependencies, from dependency to dependent. Dashed red where they block, hidden when they connect the same column and add nothing. | Fixed: x by phase column, y stacked by order. Opens at the first lanes at 90% zoom and pans sideways with the scroll wheel instead of fitting all seven lanes. |
| 2 | **Work map** (board view) | Person (`PersonChip`), branch (name, pushed or not, tip time), feature (small `FeatureCard`). | Person → branch → feature. | dagre, left to right. Hovering dims everything but the hovered node's neighbours. |
| 3 | **Dependency map** (`/map`) | In-flight features, plus every feature they depend on: landed ones shown muted, unknown ones with a dashed outline. | Dependency → dependent. Critical-path edges emphasized. Cycle edges marked with a "cycle" label. | dagre, left to right, with ranks following dependency order. |
| 4a | **Versions** (feature tab) | The people carrying the feature, their branches, and the version each branch holds (phase, progress, last change). The version shown on the board is marked. | Person → branch → version. | dagre, left to right. |
| 4b | **Dependencies** (feature tab) | This feature, plus two hops upstream and downstream. | As in 3. | dagre, left to right. |

**Scale**: the layer-1 ceiling is 100 in-flight features, about 100 dependencies and 50 people, so at
most about 300 nodes. That fits React Flow without virtualization. `onlyRenderVisibleElements` is
turned on for the work map anyway, because it is the widest.

**Accessibility**: each graph has the list view as its text equivalent. Nodes are focusable and
carry an `aria-label` such as "112 Team board, Implement 7 of 19, blocked by 099". States always
have text as well as colour.

**Security**: node and edge labels are plain React text, so titles from untrusted documents are
escaped. Graphs never use HTML labels. The only `dangerouslySetInnerHTML` in the app is mermaid's
SVG output, rendered in `securityLevel: 'strict'` (R9).

## Packages (all MIT; versions in research R12 and R13)

| Package | Use |
|---|---|
| `@xyflow/react` 12.12 | The four graph views |
| `@dagrejs/dagre` 3.1 | Automatic layout for graphs 2 to 4 |
| `recharts` 3.10, through shadcn `chart` | Phase bar and donut |
| shadcn/ui (Radix), `lucide-react`, `sonner`, `cmdk`, `@tanstack/react-table`, `date-fns` | Primitives, icons, toasts, ⌘K, tables, relative times |
| `@fontsource-variable/geist`, `@fontsource-variable/geist-mono` | Fonts served from the app's own files |
