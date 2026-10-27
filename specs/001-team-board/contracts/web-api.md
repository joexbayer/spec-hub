# Contract: web API (single-page app ↔ hub)

These are Hono routes under `/api`. The web app uses them through the typed `hc<AppType>` client;
routes are chained so their types are inferred (R1, R12).

- **Auth**: Better Auth session cookie.
- **Mutations**: also require a same-origin `Origin` header (Hono `csrf()`).
- **Validation**: every body and parameter is validated with zod.
- **Membership**: every project route checks membership, and the admin routes check the `admin`
  role. Membership is keyed on the GitHub account id (resolved from the username at assign time),
  never the login; it is bound to the hub user when that account signs in.
- **Hub admins**: the GitHub account ids in `SPEC_HUB_ADMINS`, matched against the user's stored
  GitHub id, not the login (FR-026).
- **Waiting for access**: anyone with a GitHub account can sign in. A person who is not a hub admin
  and in no project is *waiting*: the web shows only the waiting page, project routes answer 403
  and `POST /api/tokens` answers 403 `{ error: 'waiting for access' }` (FR-025).

| Method and path | Who | Purpose |
|---|---|---|
| `GET,POST /api/auth/*` | anyone | Better Auth: GitHub sign-in, session, sign-out. `/api/auth/api-key/*` returns **404**: tokens are managed only below, so every change is audited. |
| `GET /api/me` | signed in | `{ user: { id, githubLogin, name, image }, isHubAdmin, waiting, projects: [{ slug, name, role }] }`. `waiting` is `!isHubAdmin && projects.length === 0`. |
| `GET /api/people` | hub admin, or admin of at least one project | Everyone who has signed in: `[{ id, githubLogin, name, image, waiting, lastSignInAt }]`, by login. Suggestions for the username field when assigning. |
| `GET /api/projects/:slug/board` | member | Board entries (each with its `dependsOn`, branches and their carriers' identities), the recently landed and stale groups, and collisions. Computed by `buildBoard`. The pipeline, work map and dependency map are derived from this one response in the browser by the same `packages/core` functions (FR-039). Polled every 10 s (R7). |
| `GET /api/projects/:slug/features/:dir` | member | One feature: every carrying branch, plus document content and facts for the version shown. `?branch=` picks another version. |
| `GET /api/tokens` | signed in | The caller's tokens: id, name, start, created, last used. Never the key. |
| `POST /api/tokens` `{ name }` | signed in, not waiting | Creates a token with `hub: [report, read]`. Returns the plaintext **once**. Audited. A waiting person gets **403** `{ error: 'waiting for access' }`. |
| `DELETE /api/tokens/:id` | owner | Revokes the token. Audited. |
| `GET /api/projects/:slug/connect` | member | The values the connect page needs: hub URL, slug, hooks mode hint, MCP URL. |
| `POST /api/projects` `{ slug, name, defaultBranch, numbering }` | hub admin | Creates a project, with the creator as its admin. Audited. |
| `PATCH /api/projects/:slug` | project admin | Changes `name`, `defaultBranch` or `numbering`. Audited. |
| `GET /api/projects/:slug/members` | project admin | `[{ githubId, githubLogin, userId, role, name, image, pending }]`, by login. `pending` (no hub user yet, `userId`/`name`/`image` null) shows the login GitHub returned at assign time; once bound, the person's current login. |
| `POST /api/projects/:slug/members` `{ githubLogin, role }` | project admin, or any hub admin | Assigns by GitHub username, signed in or not (FR-027). The hub resolves the username with GitHub's public API (`GET <GITHUB_API_URL>/users/<login>`, no token, 5 s timeout) every time. **201** `{ githubId, githubLogin, role, pending }`, **404** `no GitHub user @x` (also for an organisation), **409** already a member, **422** not a valid username, **502** `couldn't reach GitHub` (network, timeout, 5xx, rate limit). If that account already signed in it is bound at once; otherwise its first sign-in binds it (by account id, never login). Audited as `member_added` `{ githubLogin, githubId, role }`. |
| `PATCH /api/projects/:slug/members/:githubId` `{ role }` | project admin | Changes a role, pending members included. Refuses to demote the last admin (**409**). Audited. |
| `DELETE /api/projects/:slug/members/:githubId` | project admin | Removes the member, pending ones included, and deletes their clones; their last removal puts them back to waiting. Refuses to remove the last admin (**409**). Audited. |
| `GET /api/projects/:slug/security-events?before=` | project admin | Audit log, newest first, 100 per page (FR-031). |
| `GET /extension/spec-hub.zip` | anyone | The Spec Kit extension built with this hub version (R11). It contains no secrets. |
| `GET /healthz` | anyone | `200 ok` after the database answers. |

The single-page app's routes (TanStack Router, file-based) are:
- `/sign-in`
- the waiting page: rendered by the `/_app` layout in place of the app while `me.waiting` (any other
  path redirects to `/`)
- `/` (redirects to the person's only project, or lists them)
- `/p/$slug` (board, with `?view=list|pipeline|work`)
- `/p/$slug/map` (dependency map)
- `/p/$slug/f/$dir` (feature, with tabs `spec|plan|tasks|versions|dependencies`)
- `/p/$slug/connect`
- `/p/$slug/admin` (members and security log)
- `/tokens`
- `/admin/projects` (hub admin)
