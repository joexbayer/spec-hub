---
name: spec-hub-dev
description: How to run, test and change Spec Hub locally — Homebrew Postgres, the dev URL, the shared test database, Node type stripping, pnpm 12 quirks and package boundaries. Use when starting the hub, running or adding server/core/web tests, adding a dependency, getting "cannot find module" or ERR_PNPM_IGNORED_BUILDS, seeing flaky DB tests, or deciding where code goes (core vs server vs web).
---

# Working on Spec Hub

## Run it
- Postgres 18 comes from Homebrew: `brew services start postgresql@18` (it owns localhost:5432;
  docker-compose's db publishes no port on purpose). `createdb spechub` once.
- `.env` from `.env.example`. `SPEC_HUB_ADMINS` is numeric GitHub account ids, not logins
  (`gh api users/<login> --jq .id`; @octocat is 583231) — a login there fails env validation.
  In dev `PUBLIC_URL=http://localhost:5173` (the Vite origin; it
  proxies `/api`, `/mcp`, `/extension`, `/healthz` to the server on :3000). The GitHub OAuth
  callback is `http://localhost:5173/api/auth/callback/github`. Point a reporter's `hub_url` at
  :5173 too.
- `pnpm install && pnpm --filter @spec-hub/server db:migrate && pnpm dev`.
- Everything: `pnpm check` (typecheck, Biome, all tests, `pnpm run audit`). Note `pnpm audit`
  alone is pnpm's built-in (fails on moderate); the script is `pnpm run audit` (high only).

## Tests
- Server tests hit real Postgres. `apps/server/test/setup.ts` (vitest globalSetup) **drops and
  recreates `spechub_test` on every run**, so never run two server test processes at once
  (parallel agents included) — one will kill the other's database. Core and web tests are safe
  to run in parallel.
- Helpers in `apps/server/test/helpers.ts`: real Better Auth sessions (`sessionCookie`, built the
  way better-auth's test-utils signs cookies) and real API keys (`createToken`). `createUser` gives
  each user a fresh GitHub id; pass `{ githubId: HUB_ADMIN_ID }` for a hub admin (vitest.config.ts
  sets `SPEC_HUB_ADMINS` to it). A user in no project is *waiting*: `POST /api/tokens` is 403, so
  `addMember` first when a test creates tokens through the API.
- `hookTimeout` is 30 s because `truncateAll` can be slow on a loaded machine.
- Run your own database when another agent may be testing: `SPECHUB_TEST_DB=spechub_x pnpm --filter
  @spec-hub/server test`, then `dropdb spechub_x`.
- `security_event` is append-only (a trigger raises on UPDATE/DELETE): tests cannot clear it, only
  `truncateAll` can. `sessionCookie()` writes a hub-level `sign_in` event for that user, and the project
  security log includes members' hub-level events, so expect it in log assertions.
- To prove nothing secret is logged, spy every console level and check `inspect(args)`; drizzle's
  failed-query errors carry the query params (session tokens) in `message` and `cause`.

## Access model
- Anyone with GitHub can sign in. Hub admin = `user.githubId` in `SPEC_HUB_ADMINS`
  (`isHubAdmin` in `apps/server/src/auth/session.ts`); never compare logins for access.
- `membership` is keyed `(project_id, github_id)`; `user_id` is null while pending and bound by
  account id (at assign time, or `bindMemberships` in the user-create hook) — never by login. The
  login shown comes from `user.github_login` (refreshed each sign-in), or `assigned_login` while
  pending. Assigning (`POST .../members { githubLogin }`) calls GitHub's API
  (`apps/server/src/services/github.ts`, `GITHUB_API_URL`); tests point it at `http://github.test`
  and stub fetch with `stubGithub({ login: id })` from `test/helpers.ts` — never github.com.
  Not a hub admin + no bound membership = waiting
  (`isWaiting`; `/api/me` returns `waiting`, and `apps/web/src/routes/_app.tsx` then renders only
  the waiting page).
- `user.githubId`/`githubLogin` are Better Auth `additionalFields` filled by `mapProfileToUser`. They
  must stay input fields: Better Auth 1.7 silently drops `input: false` fields from the mapped profile,
  and every first sign-in then fails with `MISSING_FIELD` (it shipped that way once — seeded demo users
  hid it). What keeps users from setting them: `/api/auth/update-user` is closed (404) in `app.ts` and
  there is no email sign-up; `test/github-sign-in.test.ts` runs the real OAuth flow against stubbed
  GitHub and checks both. Any new Better Auth plugin that accepts user input reopens this.
- Seeding users by hand (scripts, demo hubs): also insert an `account` row with
  `provider_id = 'github'`, `account_id = <github id>` — migration 0002 and real sign-ins expect it.

## Code rules that bite
- The server runs its `.ts` sources directly on Node (type stripping; `erasableSyntaxOnly`): use
  `.ts` in relative imports, `import type` for types, no enums/namespaces/parameter properties.
  There is no server build step; the Dockerfile runs `node src/index.ts`.
- `@spec-hub/core` is pure (no I/O). `gitBlobId` uses `node:crypto`, so it is a separate,
  server-only entry: `import { gitBlobId } from '@spec-hub/core/git-object-id'` — never from the
  core index (the web bundles the index).
- `parseDocument` must stay linear on hostile Markdown: the body is a line scanner (fences, tasks,
  clarification markers); mdast only parses the header region (before the first `## `, 16 KiB) in
  container-free blocks of at most 4 KiB. micromark is superlinear on nested lists/quotes and
  emphasis runs, and gfm overflows the stack on deep nesting — never run it on a whole document.
- Better Auth's api-key plugin reports an unexpected error (database down) as `INVALID_API_KEY`, the
  same code as an unknown key; `requireToken` probes the pool before answering 401.
- Validation: `zv(target, schema)` from `apps/server/src/validate.ts`, not raw `zValidator` (zv
  throws so `onError` returns 422).
- Mount each route module with one `.route(...)` line in `apps/server/src/app.ts`. The web calls the
  API with plain `fetch` (`apps/web/src/lib/api.ts` `json()`), not a typed client.
- pnpm 12 blocks dependency build scripts: allow them in `pnpm-workspace.yaml` under
  `allowBuilds:` (esbuild is already there).
- shadcn CLI (`pnpm dlx shadcn@4.22.1 add …` in apps/web) writes `from "cn"`; change it to
  `@/lib/utils`. `src/components/ui/` is vendored and excluded from Biome.
- UI: design reference only from the admin kit — see the `admin-kit-reference` skill.
- Drizzle renders columns **unqualified** in a single-table `select`, so a correlated subquery in a
  `sql` field that writes `${project.id}` binds `"id"` to the subquery's own table (Hub projects
  showed 0 features for every project). Name the outer table explicitly (`"project"."id"`), and
  test the count with real rows.
- The hub serves `apps/server/public`, so after a web change run `pnpm --filter @spec-hub/web build`
  and reload. Server changes need a hub restart (no watch in the demo script).

## Screenshots of the running hub
- From the main session: the Playwright MCP tools (`browser_run_code_unsafe`), with a fresh context
  per check so a cached `index.html` can't hide a new build:
  `const ctx = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(await page.context().cookies())`. Check 1440×900 and 390×844, light and dark.
- Subagents may not have the Playwright MCP tools. They can drive Chrome with the Playwright
  library from the npx cache, using the session cookie from a signed-in profile, and must delete
  the profile copy and cookie file afterwards.
- No GitHub OAuth app locally? Sign in by minting a session: a throwaway `.ts` in `apps/server` that
  calls `(await auth.$context).internalAdapter.createSession(userId, false, {}, true)` and signs the token
  with `makeSignature(token, ctx.secret)` (as `sessionCookie` in `test/helpers.ts`), run with the hub's
  env; cookie `better-auth.session_token=<token>.<sig>` on `localhost`. A new `BETTER_AUTH_SECRET`
  invalidates old cookies, so mint after restarting with a fresh secret. Delete the script after.
- Graph start view (`features/graphs/graph-canvas.tsx` `InitialView`): fit the whole graph if it fits at
  zoom ≥ 0.8, otherwise start at the top-left (or centred on `focus`) at 0.8; card text is unreadable
  below that. It computes bounds from `nodeSize`, not measured sizes — xyflow's `fitView` silently did
  nothing with `onlyRenderVisibleElements`.
- Screenshots go in `.playwright-mcp/` (gitignored). Delete any admin-kit screenshots; they are
  licensed visuals.
