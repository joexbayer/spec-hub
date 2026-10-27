---
name: admin-kit-reference
description: How to use the Shadcnblocks admin kit as a visual reference for Spec Hub's web UI without copying its code (license). Use when building or restyling any apps/web screen, choosing a layout for the board, feature detail, dependency map, connect, tokens or admin pages, building xyflow graph views, or taking screenshots of shadcnblocks-admin.vercel.app pages.
---

# Admin kit as design reference

## The rule

The Shadcnblocks admin kit (a licensed local copy, not part of this repository) is licensed per purchaser. It
forbids redistributing it "in a tool or template" or offering it "from a SaaS". Spec Hub is meant to
be installed by any team, so:

- **Look; don't copy.** No file, no component body and no CSS from the kit may enter this repo
  (constitution Art. 6, since 1.1.0).
- Write every component yourself on MIT shadcn/ui primitives, `@xyflow/react` and shadcn charts.
- Reading the kit's source to understand a layout is fine. Pasting it is not.

## Which page informs which screen

The full mapping is in `specs/001-team-board/ui.md`.

| Spec Hub screen | Kit page (live URL path) | What to take |
|---|---|---|
| Board | `/payment-processor/dashboard-2` | Nested "card in card" stat strip, right rail lists |
| Pipeline view | `/project-management/issue-kanban-1` | Column and card density |
| Dependency map | `/project-management/dashboard-4` | xyflow canvas, health donut, critical-path rail |
| Feature detail | `/project-management/project-detail-2` | Header chips, stat strip, tabs, right rail |
| Graph inspector | `/payment-processor/payment-workflow` | Canvas with a right inspector panel and checklist |
| Tokens | `/developers/api-keys` | Key list and create flow |
| Members, security log | `/project-management/member-list-1`, `/developers/events-&-logs` | Tables |

## Taking screenshots

- The live demo is `https://shadcnblocks-admin.vercel.app<path>`. Route groups such as `(devtools)`
  don't appear in URLs.
- **Pages render skeletons first.** Wait 5–8 s after navigating (`browser_wait_for time: 8`), or the
  screenshot is grey boxes.
- The Playwright MCP server writes only inside the project (`.playwright-mcp/`, which is
  gitignored). Delete the screenshots afterwards: they are the kit's licensed visuals.
- Component sources: `src/components/<area>/<page>.tsx`. Graphs use `@xyflow/react` 12 with
  `@xyflow/react/dist/style.css`. The blocks have no `next/*` imports apart from `next-themes`.
