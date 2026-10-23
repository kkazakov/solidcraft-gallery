# Implementation status

**Updated:** 2026-10-23 · **Milestone:** M0 complete; M1 slice, gallery, GitHub sources, OAuth, hosted Forgejo, nsjail, **admin, Ansible deployment, HTTPS, Forgejo OAuth + hosted-repo token, invite-gated beta, English/Bulgarian UI** · **Next:** hosted-project smoke test, off-host backups, monitoring, Bulgarian copy

This file records what actually runs, not what is planned. The plan remains in
[README.md](README.md) and [docs/14-roadmap.md](docs/14-roadmap.md).

## Running today

| Piece | State | Verified by |
|---|---|---|
| pnpm workspace, TypeScript, ESLint, Prettier, Vitest | done | `pnpm lint`, `pnpm check`, `pnpm test` |
| `@gallery/core` — manifest, slugs, visibility, errors, limits, session tokens | done | 33 unit tests |
| `@gallery/design` — read ZIP/JSON, strip `cache/*`, real fixture | done | 11 unit tests |
| `@gallery/db` — schema, migrations, queue, users/identities/sessions, invites, projects/versions/active version, search, repos | done | 23 integration tests on PostgreSQL 16 |
| `@gallery/git` — local repository, read-only GitHub client, Forgejo contents API | done | 17 tests (real git + mock HTTP) |
| `@gallery/storage` — content-addressed artifacts, atomic writes | done | 2 tests |
| `@gallery/render` — nsjail plan, direct plan, no-shell runner | done | 12 tests |
| nsjail worker — sandboxed CLI with no network, read-only root, rlimits | done | container render of 5 artifacts under nsjail |
| `@gallery/web` — OAuth, dashboard create/edit flow, publish, gallery/search, GitHub connect/sync/webhook, Forgejo provisioning | done | end-to-end curl/browser flow + 26 integration/unit tests |
| Localization — English, Bulgarian, French, German and Spanish, `Accept-Language` detection, dashboard preference in localStorage/cookie | done | 21 unit tests; curl checks for HTML `lang`, cookie precedence and `POST /language` |
| `@gallery/worker` — job loop, retries, nsjail render handler (local, Forgejo and cached external) | done | 9 tests + containerized nsjail render |
| `craftpub` — `lean`, `validate`, `inspect` | done | fixtures and failure exits exercised |
| Compose (Caddy, web, worker, Postgres, Forgejo, Mailpit) | config valid | web/worker images build |
| Ansible deployment to `root@192.168.88.222` | done | `./scripts/deploy.sh`; health checks on 8080/8081 |
| CI — lint, check, test, build, migrate, DB tests | done | workflow; first push run |
| `AGENTS.md` | done | reviewed against the repository |

## The vertical slice, end to end

Verified with a real `solidcraft-cli 0.19.0` and `fixtures/real/box.solidcraft`:

1. `GET /auth/dev?username=alice` creates a hashed session; `/api/v1/me` returns `alice`.
2. `POST /api/v1/projects` creates a real git repository at `DATA_DIR/repos/alice/e2e-box`.
3. `POST /api/v1/projects/:id/publish` strips the cache, commits, tags, inserts a version and queues
   `version.render`.
4. The worker renders three 1200×900 PNGs, STEP/STL and metrics; version and project become `ready`.
5. The public page shows the images and measurements; `/media/...` serves them anonymously.
6. `.solidcraft`, STEP and STL downloads work; the `.solidcraft` download is lean (449 bytes).
7. **Home shows the project card with its render; `/search?q=box` finds it; license and tag filters
   work; `/sitemap.xml` lists it; `robots.txt` is served.**
8. **The dashboard settings form changes visibility.** Private returns 404 for page, media and
   downloads while the owner still sees them; public restores anonymous access.
9. **A public GitHub repository connects read-only.** `POST /api/v1/repos` validates the URL,
   reads metadata/tree/raw files at the commit, caches the lean design in artifact storage, creates
   the project/version and queues a render. The worker renders from `versions.design_key` without
   any local clone. `POST /api/v1/projects/:id/sync` fetches a newer commit and queues it; the same
   commit is a no-op.
10. **OAuth sign-in works end to end.** `/auth/login/forgejo` sets a signed PKCE/state transaction
    cookie and redirects to the provider; `/auth/callback/forgejo` verifies state and PKCE, exchanges
    the code, reads the profile, upserts the user + identity and creates a session. Repeated sign-in
    reuses the same account; tampered state, open redirects and unconfigured providers fail closed.
11. **A signed GitHub push webhook syncs and renders.** `POST /webhooks/github` verifies the HMAC over
    the raw body, resolves the repository by numeric id and only follows the default branch. A push
    created version `c…`, queued a render and became `ready`; a bad signature returned 401, a replay
    returned `changed:false`, and ping returned 202.
12. **Hosted Forgejo projects work end to end.** With `FORGEJO_ADMIN_TOKEN` set, creating a project
    provisions a private repository, publishing writes `project.json`/design through the contents API
    and caches the lean design, the worker renders it, and setting visibility public calls Forgejo's
    repo API before the DB update. Verified against a mock Forgejo: 201 create, 202 publish, `ready`
    render, public page/image/449-byte download, `repos.is_private = false`.
13. **The worker renders inside nsjail.** The image builds nsjail 3.4; the worker renders a real
    external-source version with `SANDBOX_MODE=nsjail` under `SYS_ADMIN`/unconfined seccomp. The job
    produced all five artifacts in 375 ms. Raw nsjail runs of `snapshot`, `eval`, STEP and STL all
    succeeded with no network namespace and no `/proc`.
14. **Invite-gated OAuth works.** With `INVITE_REQUIRED=1`, a new provider login without a code is
    redirected back to `/auth/login?error=invite`; a code created by `pnpm invites create --by admin`
    completes the login, increments the invite atomically and creates the account. An existing
    identity signs in without a code. `ADMIN_USERNAMES=invitee` promoted that new account to admin.
    A fresh `ADMIN_USERNAMES=adminboot` identity also bypassed the invite and was promoted on first login.
15. **Create and edit share one publishing model.** The create page takes title, description, file,
    version, visibility and a GitHub-common license, derives the slug, commits the design and queues
    the render in one submit. The edit page repeats those fields, adds a new version, lists history
    and can activate any ready version; the public page marks the active one as **live**.

## Local staging deployment

A real Forgejo stack is running locally via Compose (not a mock):

- Web: `http://localhost:8080`; Forgejo: `http://localhost:8081`.
- Postgres: `localhost:5432/gallery`; worker uses nsjail and the mounted CLI.
- **Self-registration is enabled on staging:** Forgejo's sign-up page is linked from the gallery login,
  `FORGEJO_DISABLE_REGISTRATION=false`, and `INVITE_REQUIRED=0`. Production defaults keep both gates
  closed.
- Forgejo admin: `gallery-admin`; password in `/tmp/forgejo-admin-password.txt` (staging only).
- Provisioning token: `/tmp/forgejo-admin-token.txt`; OAuth app credentials and gallery secrets:
  `/tmp/gallery-staging.env` (mode 0600). The OAuth app redirect is
  `http://localhost:8080/auth/callback/forgejo`.
- The worker override `/tmp/gallery-staging-override.yaml` mounts the CLI from `/tmp`; this is not a
  durable deployment path.
- Verified self-registration: `selfuser` signed up on Forgejo, approved OAuth and got a gallery account
  without an invite (`role=user`).
- The theme defaults to the operating system; a header icon cycles System → Light → Dark and stores
  the choice in `localStorage` before paint.
- Project titles and descriptions can be edited from the dashboard or `PATCH /api/v1/projects/:id`;
  the hosted `project.json` is committed in the same operation. Slugs are derived from the title at
  creation and repository names remain immutable.
- The create and edit pages publish the first/new version with the metadata. A ready version can be
  pinned as active; the public page and downloads follow it. A public project may be created while
  its first render is pending, but stays out of listings and 404s for visitors until that render is
  ready.
- Visibility saves now update the project row and `repos.is_private` in one transaction, roll the
  Forgejo repository back if the DB update fails, and redirect to a fresh page with `?saved=1`.
- Verified end to end: real Forgejo OAuth consent/login created `gallery-admin`, a hosted project
  provisioned a real private repo, publish wrote `project.json` + the 449-byte lean design, nsjail
  rendered five artifacts, public visibility flipped the Forgejo repo to public, and the public page,
  image and download returned 200.

## Remote deployment

The single-host stack is deployed with Ansible to `root@192.168.88.222` (see
[16 — Deployment](docs/16-deployment.md)):

- Caddy publishes the gallery on `http://192.168.88.222:8080` and Forgejo on
  `http://192.168.88.222:8081`; `solidcraft.drun.net` and `forgejo.drun.net` are configured in `.env`.
- **HTTPS is live through an external OpenResty TLS terminator.** Both domains resolve to
  `92.247.221.87`, which proxies to this host's `8080`/`8081`; Caddy stays on HTTP and
  `CADDY_AUTO_HTTPS=off` is intentional for this mode. Certificates are valid Let's Encrypt certs
  (`solidcraft.drun.net` and `forgejo.drun.net`, expiry 2027-01-21).
- Verified over HTTPS: `/healthz`, `/readyz`, `/` and Forgejo `/api/healthz` return success;
  `https://solidcraft.drun.net/auth/login` offers "Continue with Forgejo"; the OAuth start returns a
  `303` to `https://forgejo.drun.net/login/oauth/authorize` with
  `redirect_uri=https://solidcraft.drun.net/auth/callback/forgejo`.
- The Forgejo OAuth2 application **SolidCraft Gallery** exists (confidential, redirect URI
  `https://solidcraft.drun.net/auth/callback/forgejo`); `FORGEJO_CLIENT_ID`/`_SECRET` are set and the
  web container was redeployed. The first OAuth consent was completed for `gallery-admin`; the user
  row is `admin` with a `forgejo` identity.
- `solidcraft-cli 0.19.0` runs inside the worker; the Forgejo admin `gallery-admin` exists and is
  active; pre-migration `pg_dump` files land in `/opt/solidcraft-gallery/backups`.
- A second deploy skips the image transfer when the local and remote image IDs match, runs the
  backup and migration steps, and leaves the data volumes intact.
- A Forgejo admin token is configured as `FORGEJO_ADMIN_TOKEN`. A real `POST /api/v1/user/repos` /
  `DELETE /api/v1/repos/...` round trip with that token succeeded, and the web container has it, so
  hosted projects now provision real Forgejo repositories instead of local git.
- The gallery is on a **closed beta**: `INVITE_REQUIRED=1`, so a new provider identity needs a
  valid invite unless it matches `ADMIN_USERNAMES`. New people register at
  `/auth/register?invite=<code>`; the sign-in page links there and keeps an **Invite code** field for
  people who already have a Forgejo account but no gallery identity. Existing identities and
  allowlisted admins sign in without a code. Invites are created with `pnpm invites` /
  `scripts/new-invite.sh`; the raw code is shown once.
- Forgejo sign-up is **closed** (`FORGEJO_DISABLE_REGISTRATION=true`). Invite holders create their
  own provider account at `/auth/register?invite=<code>`: the gallery provisions it with
  `FORGEJO_ADMIN_TOKEN`, consumes the invite and inserts the user + `forgejo` identity atomically,
  then sends them to sign in. The operator can still create accounts by hand (`forgejo admin user
  create`). Reopening sign-up is a one-variable change.
- The user still signs in from their own browser; the server-side account and identity are already in
  place.
- Caddy's own TLS path (`CADDY_AUTO_HTTPS=on` + `compose.tls.yaml`) remains available if the external
  terminator is ever removed.

## Not implemented (next)

1. GitHub polling (webhooks + manual **Sync now** work), GitLab/Gitea sources, private external repos.
2. Persist encrypted OAuth tokens and use user-owned repositories; add a hosted-Forgejo webhook for
   direct pushes; linking/unlinking identities.
3. API tokens, published-project quotas, a web invite-admin UI and audit entries.
4. `repo.sync` / `version.ingest` queue handlers (external sync currently runs synchronously in web).
5. A dedicated nsjail rootfs and per-jail seccomp profile; today the worker needs `SYS_ADMIN` and the
   image root is read-only but shared.
6. Cursor pagination (search/home use `?page=N`), sync rate limits, featured-content admin UI.
7. Pre-receive lean hook, moderation and reports.

## Quick start

```sh
pnpm install
docker compose -f infra/compose.yaml up -d postgres
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm db:migrate
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm --filter @gallery/db test
```

Compose note: the worker image builds nsjail; mount the CLI at
`/usr/local/bin/solidcraft-cli` and keep `SANDBOX_MODE=nsjail`. For a quick local flow without nsjail,
use `SANDBOX_MODE=direct ALLOW_UNSANDBOXED_RENDER=1` and `pnpm dev:worker`.

Local end-to-end (needs a `solidcraft-cli` binary):

```sh
export DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery
export DEV_LOGIN=1 DATA_DIR=./data
pnpm dev:web
# another terminal
SOLIDCRAFT_CLI=/path/to/solidcraft-cli SANDBOX_MODE=direct ALLOW_UNSANDBOXED_RENDER=1 pnpm dev:worker
```

Then `http://localhost:5173/auth/dev?username=alice`, create a project from the dashboard, publish a
design, wait for the preview, and use the visibility form.

## Known gaps and risks

- Fixtures include one real design (`fixtures/real/box.solidcraft`); the synthetic ones remain for
  malformed-input tests.
- `SANDBOX_MODE=nsjail` is the compose default. The worker image contains nsjail 3.4 but not the
  `solidcraft-cli` binary; mount the pinned CLI at `/usr/local/bin/solidcraft-cli`. The direct renderer
  remains available only for development (`SANDBOX_MODE=direct`, explicit flag).
- nsjail needs Docker `SYS_ADMIN` and `seccomp=unconfined`; the jailed process itself has no
  capabilities, no network and a read-only root. A dedicated rootfs and seccomp profile are next.
- Forgejo is pinned to major tag `9`; confirm the current stable tag before the first deployment.
- Search is offset-paginated and has no synonym table; see the note in `docs/09-search.md`.
- External sync runs synchronously in the web tier and has no polling or per-user rate limit.
  Webhook delivery is deduplicated by the last synced commit, not a delivery table. GitHub supplies
  the only source provider; GitLab/Gitea and private repositories return a clear unsupported error.
- OAuth tokens are discarded after profile lookup. Hosted Forgejo provisioning uses
  `FORGEJO_ADMIN_TOKEN`; repositories are owned by that account and the signed-in Forgejo identity is
  added as a collaborator. Without the token, hosted projects fall back to local git. Forgejo OAuth
  needs an app registered with the exact `${PUBLIC_ORIGIN}/auth/callback/forgejo` redirect. The
  browser and server may need different Forgejo URLs (`FORGEJO_PUBLIC_URL` vs
  `FORGEJO_INTERNAL_URL`).
- The repo URL constraint now permits `http://` so the bundled local Forgejo can be stored; production
  must still use HTTPS. Existing Forgejo tags are not replaced on republish.
- Invite administration is CLI-only (`pnpm invites`); setting `ADMIN_USERNAMES` and signing in once is
  the bootstrap path. There is no audit table write for invite creation/acceptance yet.
- The GitHub API base is injectable for tests (`GITHUB_API_BASE`/`GITHUB_RAW_BASE`); production
  uses github.com. The design is cached, so a deleted upstream repo leaves the site working.
- The public GitHub repository is private while the scaffold is in flux.
