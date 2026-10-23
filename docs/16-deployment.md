# 16 — Deployment

The production-shaped deployment is one Docker Compose stack on one host, driven by Ansible from a
developer machine. The controller builds the two application images, uploads them, and the host runs
only prebuilt images. Every deployment and runtime value comes from one `.env` file.

```text
controller                                  host (root@192.168.88.222)
┌─────────────────────────┐   SSH    ┌──────────────────────────────────────────┐
│ .env                    │ ───────► │ /opt/solidcraft-gallery                  │
│ git checkout            │          │   .env  compose.yaml  compose.tls.yaml   │
│ docker build web/worker │          │   caddy/Caddyfile  postgres/init.sh      │
│ docker save | gzip      │ ───────► │   bin/solidcraft-cli  backups/           │
└─────────────────────────┘          │                                          │
                                     │ caddy :8080 -> web:3000                  │
                                     │        :8081 -> forgejo:3000             │
                                     │ worker, postgres, forgejo (internal)     │
                                     └──────────────────────────────────────────┘
```

The high ports are the stable contract:

| Public URL | Backend |
|---|---|
| `http://<host>:8080` (or `http://solidcraft.drun.net:8080`) | gallery web |
| `http://<host>:8081` (or `http://forgejo.drun.net:8081`) | Forgejo |

When `CADDY_AUTO_HTTPS=on`, Caddy additionally publishes 80/443 and serves
`https://solidcraft.drun.net/` and `https://forgejo.drun.net/`. The high ports keep working.

## Prerequisites

Controller (where you run `deploy.sh`):

- A checkout of this repository on a **clean branch**.
- Docker Engine with `docker compose` (the images are built locally and transferred).
- `ssh` access to `root@192.168.88.222` with a key, or `DEPLOY_SSH_KEY` pointing at one.
- Python 3.10+ and either `uv` or `pip` to install Ansible.
- The pinned `solidcraft-cli` binary on disk. It is **not** in git.

Host:

- Docker Engine with Compose v2 (`docker compose version`). The playbook can install Docker on
  Alpine; on other distributions it fails with an instruction instead of guessing.
- `x86_64`, at least 2 GiB RAM and about 2 GiB free on `/` for the images and volumes.
- Ports `8080` and `8081` free; `80`/`443` free only when TLS is enabled.
- DNS records for `solidcraft.drun.net` and `forgejo.drun.net` once you want to use the domains.

The playbook boots Python 3 on the host with `apk`, `apt-get` or `dnf` when it is missing.

## First-time setup

### 1. Create `.env`

```sh
cp .env.example .env
chmod 600 .env
```

Generate the secrets and paste them into `.env`:

```sh
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # TOKEN_ENC_KEY
openssl rand -base64 32   # SIGNED_URL_SECRET
openssl rand -hex 24      # POSTGRES_PASSWORD (URL-safe for DATABASE_URL)
openssl rand -hex 24      # FORGEJO_DB_PASSWORD
openssl rand -base64 24   # FORGEJO_ADMIN_PASSWORD (or any strong password)
```

Set `SOLIDCRAFT_CLI_SOURCE` to the CLI on the controller, for example:

```dotenv
SOLIDCRAFT_CLI_SOURCE=/tmp/solidcraft-bin/solidcraft-0.19.0-linux-x86_64/bin/solidcraft-cli
```

Important values:

| Variable | Meaning |
|---|---|
| `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_PORT`, `DEPLOY_SSH_KEY` | SSH target |
| `DEPLOY_DIR` | Remote directory, default `/opt/solidcraft-gallery` |
| `WEB_DOMAIN`, `FORGEJO_DOMAIN` | Hostnames without a scheme |
| `PUBLIC_ORIGIN`, `FORGEJO_PUBLIC_URL` | Absolute public URLs used by OAuth and links |
| `WEB_PORT`, `FORGEJO_PORT` | Host ports, default `8080`/`8081` |
| `CADDY_AUTO_HTTPS` | `off` for high ports only, `on` for 80/443 + certificates |
| `POSTGRES_*`, `FORGEJO_DB_*` | Database credentials; Compose builds the internal URL |
| `SESSION_SECRET`, `TOKEN_ENC_KEY`, `SIGNED_URL_SECRET` | Application secrets |
| `SOLIDCRAFT_CLI_PATH` | Remote path of the CLI bind-mounted into the worker |
| `SOLIDCRAFT_CLI_SOURCE` | Controller path uploaded to `SOLIDCRAFT_CLI_PATH` |
| `FORGEJO_ADMIN_*` | First-boot Forgejo admin created by the playbook |

`PUBLIC_ORIGIN` and `FORGEJO_PUBLIC_URL` are deliberately `https://` even while Caddy is on HTTP:
they describe the final public identity and must match the OAuth redirect URI. Sign-in therefore
starts working when TLS is enabled, not before.

### 2. Install Ansible

```sh
uv venv .venv
uv pip install -r infra/ansible/requirements.txt
```

`scripts/deploy.sh` prefers `.venv/bin/ansible-playbook`, then `ansible-playbook` on `PATH`.

### 3. Validate, then deploy

```sh
./scripts/deploy.sh --check
./scripts/deploy.sh
```

`--check` renders both Compose configurations, checks the shell scripts and runs the Ansible syntax
check. It does not connect to the host.

The deployment runs these steps:

1. Installs Python 3 on the host if needed and checks Docker, Compose and free disk.
2. Creates `/opt/solidcraft-gallery` with the config, the Caddyfile and the pinned CLI (mode 0755).
3. Builds `gallery-web` and `gallery-worker` on the controller, saves them to a gzip archive and
   uploads it. The previous image tags are kept as `*-previous` before the new images are loaded.
4. Starts PostgreSQL, waits for its health check, takes a `pg_dump` when the schema already exists,
   then runs `pnpm --filter @gallery/db migrate` in a one-shot web container.
5. Starts the full stack, reloads Caddy if the Caddyfile changed, and waits for `/healthz`,
   `/readyz`, `/`, Forgejo's `/api/healthz` and the domain `Host` headers.
6. Verifies `solidcraft-cli --version` inside the worker and creates the first Forgejo admin if it
   does not exist.

The default `.env` keeps `FORGEJO_BOOTSTRAP_ADMIN=1`, so the first deploy creates
`FORGEJO_ADMIN_USERNAME` with `FORGEJO_ADMIN_PASSWORD`. Change the password before the first deploy.

## Verify a deployment

```sh
curl -fsS http://192.168.88.222:8080/healthz
curl -fsS http://192.168.88.222:8080/readyz
curl -fsS http://192.168.88.222:8081/api/healthz

# Caddy host routing (DNS does not need to point at the host for these)
curl -fsS -H 'Host: solidcraft.drun.net' http://192.168.88.222:8080/healthz
curl -fsS -H 'Host: forgejo.drun.net' http://192.168.88.222:8081/api/healthz
```

Expected bodies include `{"status":"ok",...}`, `{"status":"ready"}` and Forgejo's health JSON.

On the host:

```sh
ssh root@192.168.88.222
cd /opt/solidcraft-gallery
docker compose -f compose.yaml --env-file .env ps
docker compose -f compose.yaml --env-file .env logs -f --tail=100
```

Containers should be `running`/`healthy`; `caddy`, `web`, `forgejo` and `postgres` have health
checks. The worker has no inbound port.

## First boot: Forgejo and sign-in

The playbook creates the admin but cannot create the OAuth2 application without a browser or a
token. Finish this once:

1. Open `http://192.168.88.222:8081/` (or `http://forgejo.drun.net:8081/`) and sign in as
   `FORGEJO_ADMIN_USERNAME`/`FORGEJO_ADMIN_PASSWORD`.
2. Create an instance-wide OAuth2 application:
   - Open `http://192.168.88.222:8081/admin/applications` (Site Administration → Applications).
     This is the instance-wide page; `/user/settings/applications` is for user-owned apps and is not
     what the gallery needs.
   - Create an OAuth2 application with redirect URI
     `https://solidcraft.drun.net/auth/callback/forgejo`, using a confidential client.
   - Forgejo does not implement OAuth2 scopes yet: tokens issued through this application have the
     user's full rights. Treat the client secret as a production secret.
3. Put the generated values in `.env`:

   ```dotenv
   FORGEJO_CLIENT_ID=...
   FORGEJO_CLIENT_SECRET=...
   ```

4. Optional, for hosted repositories: create a Forgejo access token for the admin and set
   `FORGEJO_ADMIN_TOKEN`. Without it, hosted projects fall back to local git storage.
5. Redeploy: `./scripts/deploy.sh`.

Sign-in only works over the final HTTPS origin. While `CADDY_AUTO_HTTPS=off` and you browse over
HTTP, the browser will not keep the secure session cookie and the Forgejo redirect URI will not
match. That is expected until the cutover below.

After the first OAuth sign-in, the account matching `ADMIN_USERNAMES` is promoted to gallery admin
and can create invites:

```sh
ssh root@192.168.88.222
cd /opt/solidcraft-gallery
docker compose -f compose.yaml --env-file .env exec -T web \
  pnpm invites create --by gallery-admin --note "beta" --uses 5 --days 30
```

From a workstation checkout, `./scripts/new-invite.sh` wraps the same call and prints the login link
the invitee opens (`${PUBLIC_ORIGIN}/auth/login?invite=<code>`); `./scripts/new-invite.sh list` and
`./scripts/new-invite.sh revoke <id>` map to the CLI. The raw code is printed once — the gallery
stores only its SHA-256 hash.

The invitee opens `https://solidcraft.drun.net/auth/register?invite=<code>` (also linked from the sign-in
page as **Have an invite? Create your account**) and chooses a Forgejo username, an optional email and a
password. The gallery creates the Forgejo account with `FORGEJO_ADMIN_TOKEN`, consumes the invite, links
the `forgejo` identity in the same transaction and sends the user to `/auth/login?registered=1` to sign
in. Forgejo sign-up itself stays closed; the invite is the only way in.

Manual provisioning is the fallback — for example when the invite holder should not choose the password:

```sh
docker compose -f compose.yaml --env-file .env exec -T forgejo \
  forgejo admin user create --username <name> --email <email> --password <temp-password>
```

Either way the gallery account appears on the first OAuth sign-in, and an invite already consumed during
registration is not asked for again. Accounts created without an email get
`${username}@${BETA_EMAIL_DOMAIN:-users.solidcraft.drun.net}`.

## HTTPS cutover

### Direct Caddy certificates

Use this when the host is reachable on 80/443 and DNS points at it (grey-cloud / no proxy).

1. Create `A`/`AAAA` records:
   - `solidcraft.drun.net` → `192.168.88.222`
   - `forgejo.drun.net` → `192.168.88.222`
2. Allow inbound `80/tcp` and `443/tcp` (and `443/udp` for HTTP/3) in the host firewall.
3. In `.env` set:

   ```dotenv
   CADDY_AUTO_HTTPS=on
   ```

4. Deploy again:

   ```sh
   ./scripts/deploy.sh
   ```

   The playbook adds `infra/compose.tls.yaml` (host ports 80/443), installs `Caddyfile.tls` (the
   same site blocks without `auto_https off`), and Caddy obtains certificates for both names. The
   certificates persist in the `caddy_data` volume. The high ports stay available.

5. Verify:

   ```sh
   curl -fsSI https://solidcraft.drun.net/ | head
   curl -fsS https://solidcraft.drun.net/healthz
   curl -fsS https://forgejo.drun.net/api/healthz
   ```

Caddy renews certificates automatically. Keep `caddy_data`; deleting it forces a new issuance and
can hit rate limits.

### External TLS terminator (Cloudflare Tunnel or proxy)

**Current deployment (2026-10-23).** Both domains resolve to `92.247.221.87`, where an OpenResty
terminator serves Let's Encrypt certificates and proxies to this host's `8080`/`8081`. Caddy stays
on HTTP, so `CADDY_AUTO_HTTPS=off` is the correct setting; the Caddy TLS path below is the fallback
if that terminator is removed.

Use this when TLS ends outside the host. Keep `CADDY_AUTO_HTTPS=off` so the playbook keeps the
HTTP Caddyfile and does not publish 80/443, and route:

- `solidcraft.drun.net` → `http://127.0.0.1:8080`
- `forgejo.drun.net` → `http://127.0.0.1:8081`

Both `PUBLIC_ORIGIN` and `FORGEJO_PUBLIC_URL` stay `https://…`. Caddy forwards the external
`Host` and `X-Forwarded-*` headers; the application and Forgejo already trust them from the edge.

Do not publish 80/443 in this mode; the `compose.tls.yaml` overlay is intentionally separate.

## Day-two operations

### Deploy a new version

```sh
git switch <branch> && git pull
./scripts/deploy.sh
```

The working tree must be clean unless `DEPLOY_ALLOW_DIRTY=1`. The script builds from the working
tree, so committing first is what makes a deployment reproducible.

### Status and logs

```sh
ssh root@192.168.88.222 'cd /opt/solidcraft-gallery && docker compose -f compose.yaml --env-file .env ps'
ssh root@192.168.88.222 'cd /opt/solidcraft-gallery && docker compose -f compose.yaml --env-file .env logs --tail=200 web worker'
```

When TLS is on, read-only commands still work with just `compose.yaml`; the overlay only adds
published ports.

### Backups

Before every migration the playbook writes `/opt/solidcraft-gallery/backups/gallery-<UTC>.dump`
and keeps `DEPLOY_KEEP_BACKUPS` files. Take an on-demand dump with:

```sh
ssh root@192.168.88.222
cd /opt/solidcraft-gallery
docker compose -f compose.yaml --env-file .env exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > "backups/manual-$(date -u +%Y%m%dT%H%M%SZ).dump"
```

Restore (destructive; stop the application first):

```sh
docker compose -f compose.yaml --env-file .env stop web worker
docker compose -f compose.yaml --env-file .env exec -T postgres \
  sh -c 'pg_restore --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < backups/gallery-20261023T090000Z.dump
docker compose -f compose.yaml --env-file .env up -d
```

Forgejo data lives in the `forgejo_data` volume; back it up with `forgejo dump` or a volume
snapshot. The database dump alone is not a complete restore for Forgejo. Off-host backups are still
an operational gap (see `docs/12-operations.md`).

### Migrations

Migrations are forward-only and run automatically as a one-shot web container. Do not run
`pnpm db:migrate` against production by hand. A destructive migration needs a restore plan and a
human decision first.

### Rollback

The playbook tags the images it is about to replace:

```sh
ssh root@192.168.88.222
cd /opt/solidcraft-gallery
docker tag gallery-web:local-previous gallery-web:local
docker tag gallery-worker:local-previous gallery-worker:local
docker compose -f compose.yaml --env-file .env up -d --no-deps web worker
```

This rolls back code only. Schema migrations are not reversible; if the previous code cannot read
the new schema, restore the pre-deploy dump instead.

### Secret rotation

- Change the value in `.env`, then `./scripts/deploy.sh`; Compose recreates the affected services.
- Rotating `SESSION_SECRET` signs everyone out.
- Changing `POSTGRES_PASSWORD` in `.env` alone does **not** change the role password. Run
  `ALTER ROLE gallery PASSWORD '…'` first, then update `.env` and redeploy.
- `forgejo`/database passwords change the same way.

### Disk pressure

The host keeps images, volumes, a compressed image archive during deploy and database dumps. Check
with `ssh root@192.168.88.222 'df -h /; docker system df'`. Prune unused images only after keeping
the `*-previous` tags you need.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `required variable … is missing a value` from Compose | `.env` is incomplete; run `./scripts/deploy.sh --check` |
| Caddy returns 502 | `web`/`forgejo` unhealthy: `docker compose ps`, then logs |
| `bind source path does not exist` | `SOLIDCRAFT_CLI_PATH` missing; set `SOLIDCRAFT_CLI_SOURCE` and redeploy |
| Worker job fails with CLI error | `docker compose exec worker solidcraft-cli --version`; check binary architecture and mode |
| Forgejo 500/database errors | The init script only runs on an empty `pgdata`. Passwords must match `FORGEJO_DB_*`; recreate the volume only on a fresh install |
| `port is already allocated` | Change `WEB_PORT`/`FORGEJO_PORT`, or free the port |
| Certificate issuance fails | DNS must point at the host, 80/443 must be reachable, `CADDY_AUTO_HTTPS=on`; check Caddy logs |
| OAuth redirect mismatch | `PUBLIC_ORIGIN` and the Forgejo application redirect URI must both be `https://solidcraft.drun.net/auth/callback/forgejo` |
| `Cross-site POST form submissions are forbidden` | The web image bakes `PUBLIC_ORIGIN` into SvelteKit's `paths.origin` at build time. Keep it on `https://…` and redeploy after changing it. |
| `ansible-playbook` exits with a non-blocking IO error | Run it from a normal terminal (not a pipe), or redirect stdout/stderr to a file |
| Deploy is refused because the tree is dirty | Commit, or use `DEPLOY_ALLOW_DIRTY=1` for a development deploy |

## Security notes

- `.env` is gitignored, uploaded with mode `0600`, and never printed by the playbook.
- Only Caddy publishes ports: `8080`/`8081`, plus `80`/`443` when TLS is enabled. PostgreSQL is
  bound to `127.0.0.1`; Forgejo's web port is internal to the Compose network.
- Root SSH is used because that is what the target provides. A non-root deploy user with a Docker
  group and sudo is the next hardening step.
- The Compose example and the current drun.net deployment are closed end to end:
  `FORGEJO_DISABLE_REGISTRATION=true` and `INVITE_REQUIRED=1`. The operator creates each Forgejo
  account (admin UI or `forgejo admin user create`) and pairs it with an invite code, so a new
  gallery identity needs both. Forgejo sign-up is a separate switch: setting
  `FORGEJO_DISABLE_REGISTRATION=false` would let invitees create the provider account themselves.
  `ADMIN_USERNAMES` must contain the Forgejo admin username.
- Database passwords should be URL-safe (hex) because `DATABASE_URL` is assembled from
  `POSTGRES_PASSWORD`. Secrets with `@`, `:` or `/` will break the URL.

## Known limitations

- The controller builds and transfers images; it needs Docker and a fast link to the host. A registry
  is the natural next step.
- The deployment is not zero-downtime: Compose replaces web/worker and Caddy may briefly return 502.
- Forgejo's OAuth2 application and admin token are created once by hand.
- The host is assumed to be `x86_64` and to present a standard SSH/SFTP server.
- Backups are on the same host until an off-host copy is added.
- The Forgejo image is pinned to major tag `9`; confirm the current stable tag before upgrading.
