# Self-hosting Spec Hub

A Spec Hub is one small Node service and one Postgres database. Run one hub per organisation; each
team or repository is a project inside it.

There are two ways to run it:

- **Kamal** (below): deploys to any Linux server you can SSH into, with automatic TLS. This is the
  recommended path.
- **Docker Compose** (end of this page): for a server where you already run a TLS proxy.

## 1. Create a GitHub OAuth App

People sign in with GitHub. The hub only needs their identity, never repository access.

1. Open GitHub → Settings → Developer settings → OAuth Apps → **New OAuth App**. To have the app
   belong to your organisation instead of your account, open
   `https://github.com/organizations/<org>/settings/applications/new`.
2. Fill in:
   - **Application name**: `Spec Hub` (people see it on the sign-in screen)
   - **Homepage URL**: `https://<your hub host>`
   - **Authorization callback URL**: `https://<your hub host>/api/auth/callback/github`
3. Register it, note the **Client ID**, then **Generate a new client secret** and copy it. GitHub
   shows the secret only once.

Signing in asks only for `read:user` and `user:email`. Anyone with a GitHub account can sign in.
Until an admin adds them to a project, they see a "waiting for access" page and can't do anything.

## 2. Prepare the server

You need:
- a Linux server with Docker, reachable over SSH;
- ports 80 and 443 open to the internet (Let's Encrypt validates over port 80);
- a DNS record for your hub host pointing at the server.

Kamal installs Docker if it is missing. Locally, install Kamal 2.8 or later (`gem install kamal`)
and run Docker, because the image is built on your machine.

## 3. Configure and deploy

```sh
cp .env.deploy.example .env.deploy     # gitignored
$EDITOR .env.deploy
bin/kamal setup                        # first time: database, proxy, certificate, app
bin/kamal deploy                       # every later release
```

`.env.deploy` holds:
- your hostname and server;
- the GitHub OAuth App from step 1;
- the hub admins, as numeric GitHub account ids (`gh api users/<login> --jq .id`);
- three secrets.

`bin/kamal` sources the file with `sh`, so a secret can be fetched at deploy time instead of written
down, for example:

```sh
BETTER_AUTH_SECRET="$(pass-cli item view --vault-name Infra --item-title spechub --field better_auth_secret)"
GITHUB_CLIENT_SECRET="$(op read op://Infra/spechub/github_client_secret)"
```

What it sets up (`config/deploy.yml`, the same file for every installation):

- **The hub container**, behind `kamal-proxy`, which gets a Let's Encrypt certificate for your
  host and forwards to port 3000. The hub runs its database migrations when it starts.
- **Postgres 18** as the `spec-hub-db` accessory, with its data in `~/spec-hub-db/data` on the
  server. It publishes no port.
- **Kamal's local registry**: the image is pushed to the server over the SSH tunnel, so no
  registry account is needed.

Check it: `curl https://<host>/healthz` should print `ok`. Then sign in with a GitHub account
listed in `SPEC_HUB_ADMINS` and create the first project under **Hub projects**.

Useful commands:
- `bin/kamal app logs -f`: follow the hub's logs.
- `bin/kamal accessory logs db`: the database's logs.
- `bin/kamal rollback <version>`: go back to an earlier release.

If the first push fails with `dial tcp [::1]:5555: i/o timeout`, another project's Kamal has left
its local registry container running on a different port. Run `docker rm -f kamal-docker-registry`,
then run setup again.

## Backups

The database holds the hub's record: projects, members, tokens and, as the coordination features
arrive, approvals, which are meant to be kept (constitution Art. 1.4). Back it up, for example
nightly from the server:

```sh
docker exec spec-hub-db pg_dump -U spechub -Fc spechub > spechub-$(date +%F).dump
```

Then copy the dump off the server.

## Docker Compose

If the server already runs a TLS proxy:

```sh
cp .env.example .env      # PUBLIC_URL=https://<host>, GitHub app, admins, BETTER_AUTH_SECRET
POSTGRES_PASSWORD=... docker compose up -d
```

The hub listens on `127.0.0.1:3000` only. Point the proxy at it.

To rate-limit sign-in attempts per client, have the proxy set one header to the client address,
replacing anything the client sent, and name that header in `TRUSTED_IP_HEADER`:
- nginx: `proxy_set_header X-Real-IP $remote_addr;`, then `TRUSTED_IP_HEADER=x-real-ip`;
- Caddy: `header_up X-Real-IP {remote_host}`, then `TRUSTED_IP_HEADER=x-real-ip`.

A comma-separated `X-Forwarded-For` chain doesn't work. Kamal's proxy already sets a single
`X-Forwarded-For` value, so the Kamal setup above needs nothing extra.

Back up the `pgdata` volume.

## Connecting teams

Once the hub runs, each developer opens the hub's **Connect** page. It walks them through
creating a token, connecting their clone and connecting their agent, with copy-paste commands for
Claude Code, VS Code, Cursor and other MCP clients.
