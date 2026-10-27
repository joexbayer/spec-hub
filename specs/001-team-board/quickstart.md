# Quickstart: Team board

Run-and-validate guide. The contracts are in [contracts/](contracts/) and the data model is in
[data-model.md](data-model.md).

## Prerequisites

- Node 24 LTS (22.12 or later works for development), pnpm 10 or later, git, curl.
- Postgres 18 for development and tests: `brew services start postgresql@18`. Docker is needed
  only for building or self-hosting the image.
- A GitHub OAuth App for sign-in, with callback `http://localhost:5173/api/auth/callback/github` (in development the browser uses the Vite origin, which proxies `/api` to the server on :3000).
  It needs no repository permissions. Create one per environment.

## Local run

```sh
cp .env.example .env    # set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, BETTER_AUTH_SECRET, SPEC_HUB_ADMINS=<your GitHub account id>
createdb spechub        # once; DATABASE_URL=postgres://localhost/spechub
pnpm install
pnpm --filter @spec-hub/server db:migrate
pnpm dev                # server on :3000 serving the API, MCP and the web app (Vite dev proxy)
```

`SPEC_HUB_ADMINS` takes numeric GitHub account ids, not logins (a login can be renamed and then
taken): `gh api users/<login> --jq .id`.

Expected: `http://localhost:5173/healthz` returns `ok`, and signing in with the account listed in
`SPEC_HUB_ADMINS` lands on an empty project list. Any other GitHub account can sign in too, and sees
only the "waiting for access" page with its login until an admin assigns it to a project.

## Automated checks

```sh
pnpm -r typecheck
pnpm -r lint
pnpm --filter @spec-hub/core test        # parsing, phase, ownership, board assembly, collisions (Art. 8.1)
pnpm --filter @spec-hub/server test      # against real local Postgres (Art. 8.2); creates spechub_test itself: ingestion,
                               # auth boundaries, audit append-only, MCP tools, reporter end to end
```

The server's reporter tests create temporary git repositories and run `scripts/spec-hub` against a
hub started on a random port. They check:
- the commit output is unchanged and hooks return in under 100 ms (SC-004, FR-005);
- an existing `pre-push` hook still runs (FR-008);
- private prefixes are respected (FR-009);
- a revoked token gives one notice per day (FR-006);
- reports catch up after the hub was down (edge cases).

## End-to-end validation (maps to the user stories)

1. **Set up a project (US5)**: as the hub admin, create the project `demo` with a numbering style.
   Assign a second GitHub account to `demo` by its username from the project's admin page (it
   need not have signed in; the hub looks the username up on GitHub, so it needs outbound HTTPS to
   api.github.com). An account that signs in before being assigned sees the waiting page and shows up in the hub
   admin's "Waiting for access" list. In a scratch repository that already uses Spec Kit, run
   `specify extension add spec-hub --from http://localhost:5173/extension/spec-hub.zip` (answer `y` to
   the one "Untrusted Source" question) and set `hub_url` and `project: demo` in
   `.specify/extensions/spec-hub/spec-hub-config.yml`.
2. **Connect (US4, SC-003)**: time it from the second account's first sign-in. Open
   `/p/demo/connect`, create a token, run `sh .specify/extensions/spec-hub/scripts/spec-hub
   connect`, and paste the token. Expected: `Connected to demo as @<login>: 0 features in flight.`
   in under 2 minutes.
3. **Work shows up by itself (US1)**: commit `specs/001-x/spec.md` on a new unpushed branch.
   Expected: no extra output, and within 30 s the board shows 001 in Specify, marked not pushed.
   Then commit a `tasks.md` with 2 of 5 tasks ticked: the board shows Implement 2/5. Then run
   `spec-hub private add scratch/` and commit on `scratch/y`: nothing appears.
4. **See everyone (US2)**: from the first account, open the board and then the feature. Expected:
   the spec renders, a mermaid block renders as a diagram, and a `<script>` written in the document
   shows as text. Create `001-other` on another branch from the second account: both entries show
   the collision flag.
5. **Agent (US3, SC-005)**: run the `claude mcp add …` command from the connect page, then ask
   Claude Code "what is the team working on?". Expected: one `board` call answering in one screen,
   with no permission prompt (the committed allow rule `mcp__spec-hub__*`).
6. **Removal (US5)**: remove the second account. Expected: their entries leave the board, their
   token gets 403 on the next report, and the security log shows the assignment, the token creation and
   the removal. With no project left, the second account is back on the waiting page.

## Pilot (after this feature is verified)

These adoption steps happen in the pilot repository, not here (constitution, Development Workflow):
1. Deploy the hub with its image and Postgres on the pilot host. This needs a domain, TLS and a
   production GitHub OAuth App, all provided by the user. `SPEC_HUB_ADMINS=583231` (@octocat's
   GitHub account id).
2. In the pilot repository, in one commit:
   - run `specify extension add spec-hub --from https://<hub>/extension/spec-hub.zip`;
   - set `spec-hub-config.yml`;
   - run `spec-hub hooks .githooks`, which adds `post-commit`, `post-checkout`, `post-merge` and
     `post-rewrite`, leaving `commit-msg`, `pre-commit` and `pre-push` untouched;
   - add `"mcp__spec-hub__*"` to `.claude/settings.json` `permissions.allow`.
3. Assign @alice, @bob and carol to the project by username. Each of them signs in
   (straight into the project), then runs `connect` and `claude mcp add`.
4. Run the pilot for two weeks against SC-001 to SC-007, with spot checks on three days.
