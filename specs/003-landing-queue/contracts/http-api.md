# Contract: HTTP routes (dashboard)

Agents use MCP (contracts/mcp-tool.md); there are no reporter routes. These sit in
`routes/landing.ts`, behind `requireSession` and `requireProjectRole()`, mounted at `/api`.

## `GET /api/projects/:slug/landing`

Runs `advance`, then returns:

```ts
{
  holder: { id, login, startedAt, minutes } | null,
  waiting: Array<{ id, login, askedAt, position, etaMinutes, mine: boolean }>,
  history: Array<{ id, login, startedAt, endedAt, outcome, endedBy: string | null }>, // last 20
  minutesPerTurn: number,
  defaultBranch: string,
}
```

## `POST /api/projects/:slug/landing/:id/end`

- **Rules**: any member can end any live place of the project (spec FR-012). The holder's place
  ends as `removed`, a waiting place as `removed`; one's own place ends as `released` or `left`.
  `ended_by` is set when it is someone else's place, and a `land_removed` security event is written.
- An unknown id, an id from another project, or an ended place gets 404.
- **CSRF**: the existing Origin check for session POSTs applies.
- **Response 200**: the same body as the GET.
