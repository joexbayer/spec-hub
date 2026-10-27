---
name: spec-hub-deploy
description: How a Spec Hub installation is deployed with Kamal (bin/kamal, config/deploy.yml, .env.deploy, .kamal/secrets) and what goes wrong. Use when deploying or redeploying a hub, running bin/kamal setup/deploy/rollback, changing config/deploy.yml, adding a deploy-time secret or env var, debugging a failed push to localhost:5555, or checking a hub after a deploy.
---

# Deploying a Spec Hub

The repo is meant for open source: `config/deploy.yml` is identical for every installation and takes
every site-specific value from the environment. An installation's values live only in the operator's
gitignored `.env.deploy` (template: `.env.deploy.example`). Never commit a hostname, IP or vault item
name.

## Run it
- `bin/kamal setup` (first time), `bin/kamal deploy` (later), `bin/kamal app logs -f`,
  `bin/kamal rollback <version>`. `bin/kamal` sources `.env.deploy` with `sh` (`set -a`) and execs
  kamal, so secret lines can be `$(pass-cli …)` / `$(op read …)` and nothing secret is stored.
- With asdf and no `.tool-versions` here: `ASDF_RUBY_VERSION=<a ruby with kamal ≥ 2.8> bin/kamal …`.
- Docker must run locally: the image is built here (`builder.arch: amd64`, emulated on Apple
  silicon, ~4 min cold) and pushed through Kamal's local registry over the SSH tunnel.
- The image deploys the current commit (`version` = HEAD sha); commit before deploying.

## Adding config
- Non-secret per-site value: read it with `need["X"]` (aborts when unset or empty) or
  `ENV.fetch("X", default)` in `config/deploy.yml`, add it to `.env.deploy.example`.
- Secret: list it under `env.secret`, add `X=$X` to `.kamal/secrets` (no values there; Kamal expands
  `$X` from the environment), add it to `.env.deploy.example`.
- The server's env schema is `apps/server/src/env-schema.ts`; a value it rejects stops the
  container at boot and the deploy times out on the health check (`/healthz`).

## Gotchas (each hit for real)
- **Push to `localhost:5555` times out (`dial tcp [::1]:5555: i/o timeout`)**: Kamal reuses a local
  container named `kamal-docker-registry` whatever port it was started on. Another project's Kamal
  had started it on 5000. `docker ps` shows the port; `docker rm -f kamal-docker-registry` and rerun
  (it only caches pushed layers). The other project will then hit the same thing in reverse.
- `TRUSTED_IP_HEADER=x-forwarded-for` is right only behind kamal-proxy with `ssl: true`, which
  replaces any client-sent value with the single address it saw. Behind another proxy, see
  docs/self-host.md.
- kamal-proxy is one per server and shared with other apps on it. `kamal setup` leaves a running
  proxy alone when it is at least Kamal's minimum version (`MINIMUM_VERSION` in kamal's
  `configuration/proxy/run.rb`; v0.9.2 for Kamal 2.12); an older one would need `kamal proxy
  reboot`, which interrupts every app on the server: ask first.

## After a deploy
- `curl https://<host>/healthz` → `ok`; response carries `content-security-policy` and HSTS.
- Sign-in wiring without a browser: `POST /api/auth/sign-in/social` with
  `{"provider":"github","callbackURL":"/"}` and `origin: https://<host>`; the returned GitHub URL
  must carry the right `client_id` and `redirect_uri=https://<host>/api/auth/callback/github`.
- On the server: `docker exec kamal-proxy kamal-proxy list` shows every app's route; check the
  neighbours are still `running`.

## Seeing exactly what a user sees in production
Answer "the hub shows X" questions from the rendered board, not from raw rows: the board applies
rules (staleness, own-branch activity, landed baseline) that a SQL reading gets wrong.
1. Copy prod into a scratch database on your machine:
   `ssh <server> 'docker exec spec-hub-db pg_dump -U spechub -Fc spechub' > /tmp/x.dump`, then
   `createdb spechub_prodcopy && pg_restore --no-owner -d spechub_prodcopy /tmp/x.dump && rm /tmp/x.dump`.
2. Run a hub on it on another port (`PORT=3001`, `PUBLIC_URL=http://localhost:3001`, a throwaway
   `BETTER_AUTH_SECRET`), mint a session for the user (see `spec-hub-dev`, Screenshots), screenshot.
3. Start it with `exec node src/index.ts` so the saved pid is node's: killing a wrapping `sh` leaves
   the old server listening and you screenshot stale code. Check with `lsof -iTCP:3001 -sTCP:LISTEN`.
4. Afterwards `dropdb spechub_prodcopy` and delete the screenshots: it is production data.
