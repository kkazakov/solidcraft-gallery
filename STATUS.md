# Implementation status

**Updated:** 2026-10-22 · **Milestone:** M0 complete; M1 slice, gallery, GitHub sources, OAuth, hosted Forgejo, **nsjail sandbox** · **Next:** user-owned tokens, invites, deployment hardening

This file records what actually runs, not what is planned. The plan remains in
[README.md](README.md) and [docs/14-roadmap.md](docs/14-roadmap.md).

## Running today

| Piece | State | Verified by |
|---|---|---|
| pnpm workspace, TypeScript, ESLint, Prettier, Vitest | done | `pnpm lint`, `pnpm check`, `pnpm test` |
| `@gallery/core` — manifest, slugs, visibility, errors, limits, session tokens | done | 33 unit tests |
| `@gallery/design` — read ZIP/JSON, strip `cache/*`, real fixture | done | 11 unit tests |
| `@gallery/db` — schema, migrations, queue, users/identities/sessions, projects/versions, search, external/Forgejo repos | done | 19 integration tests on PostgreSQL 16 |
| `@gallery/git` — local repository, read-only GitHub client, Forgejo contents API | done | 17 tests (real git + mock HTTP) |
| `@gallery/storage` — content-addressed artifacts, atomic writes | done | 2 tests |
| `@gallery/render` — nsjail plan, direct plan, no-shell runner | done | 12 tests |
| nsjail worker — sandboxed CLI with no network, read-only root, rlimits | done | container render of 5 artifacts under nsjail |
| `@gallery/web` — OAuth, dashboard, publish, gallery/search, GitHub connect/sync/webhook, Forgejo provisioning | done | end-to-end curl flow + 12 integration/unit tests |
| `@gallery/worker` — job loop, retries, nsjail render handler (local, Forgejo and cached external) | done | 9 tests + containerized nsjail render |
| `craftpub` — `lean`, `validate`, `inspect` | done | fixtures and failure exits exercised |
| Compose (Caddy, web, worker, Postgres, Forgejo, Mailpit) | config valid | web/worker images build |
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

## Not implemented (next)

1. GitHub polling (webhooks + manual **Sync now** work), GitLab/Gitea sources, private external repos.
2. Persist encrypted OAuth tokens and use user-owned repositories; add a hosted-Forgejo webhook for
   direct pushes; linking/unlinking identities.
3. Invites, API tokens, published-project quotas.
4. `repo.sync` / `version.ingest` queue handlers (external sync currently runs synchronously in web).
5. A dedicated nsjail rootfs and per-jail seccomp profile; today the worker needs `SYS_ADMIN` and the
   image root is read-only but shared.
6. Cursor pagination (search/home use `?page=N`), sync rate limits, featured-content admin UI.
7. Pre-receive lean hook, invites, API tokens, moderation and reports.

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
- The GitHub API base is injectable for tests (`GITHUB_API_BASE`/`GITHUB_RAW_BASE`); production
  uses github.com. The design is cached, so a deleted upstream repo leaves the site working.
- The public GitHub repository is private while the scaffold is in flux.
