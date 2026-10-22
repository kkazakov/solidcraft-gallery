# Implementation status

**Updated:** 2026-10-22 · **Milestone:** M0 complete, M1 slice + gallery + GitHub sources + OAuth · **Next:** webhooks, hosted Forgejo repos, nsjail

This file records what actually runs, not what is planned. The plan remains in
[README.md](README.md) and [docs/14-roadmap.md](docs/14-roadmap.md).

## Running today

| Piece | State | Verified by |
|---|---|---|
| pnpm workspace, TypeScript, ESLint, Prettier, Vitest | done | `pnpm lint`, `pnpm check`, `pnpm test` |
| `@gallery/core` — manifest, slugs, visibility, errors, limits, session tokens | done | 33 unit tests |
| `@gallery/design` — read ZIP/JSON, strip `cache/*`, real fixture | done | 11 unit tests |
| `@gallery/db` — schema, migrations, queue, users/identities/sessions, projects/versions, search, external repos | done | 19 integration tests on PostgreSQL 16 |
| `@gallery/git` — local repository, commit/tag, read-only GitHub client | done | 13 tests (real git + mock HTTP) |
| `@gallery/storage` — content-addressed artifacts, atomic writes | done | 2 tests |
| `@gallery/render` — nsjail plan, direct plan, no-shell runner | done | 12 tests |
| `@gallery/web` — **Forgejo/GitHub OAuth**, dashboard, publish, gallery/search, public pages, GitHub connect/sync/webhook | done | end-to-end curl flow + OAuth/external/webhook tests |
| `@gallery/worker` — job loop, retries, render handler (local and cached external designs) | done | 9 tests incl. two real CLI renders |
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

## Not implemented (next)

1. GitHub polling (webhooks + manual **Sync now** work), GitLab/Gitea sources, private external repos.
2. Persist encrypted OAuth tokens; Forgejo repository creation/push and hosted webhooks (local git is
   still the hosted backend); linking/unlinking identities.
3. Invites, API tokens, published-project quotas.
4. `repo.sync` / `version.ingest` queue handlers (external sync currently runs synchronously in web).
5. nsjail wiring in the worker image; the direct renderer is development-only.
6. Cursor pagination (search/home use `?page=N`), sync rate limits, featured-content admin UI.
7. Pre-receive lean hook, moderation and reports.

## Quick start

```sh
pnpm install
docker compose -f infra/compose.yaml up -d postgres
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm db:migrate
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm --filter @gallery/db test
```

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
- The direct renderer runs the CLI without nsjail. It is gated to non-production or an explicit flag,
  and the compose file currently opts in for local use.
- The worker image has no `solidcraft-cli` binary yet; mounting or baking it is part of deployment.
- Forgejo is pinned to major tag `9`; confirm the current stable tag before the first deployment.
- Search is offset-paginated and has no synonym table; see the note in `docs/09-search.md`.
- External sync runs synchronously in the web tier and has no polling or per-user rate limit.
  Webhook delivery is deduplicated by the last synced commit, not a delivery table. GitHub supplies
  the only source provider; GitLab/Gitea and private repositories return a clear unsupported error.
- OAuth tokens are discarded after profile lookup; hosted repository provisioning still uses the
  local backend. Forgejo OAuth needs an app registered with the exact
  `${PUBLIC_ORIGIN}/auth/callback/forgejo` redirect. The browser and server may need different
  Forgejo URLs (`FORGEJO_PUBLIC_URL` vs `FORGEJO_INTERNAL_URL`).
- The GitHub API base is injectable for tests (`GITHUB_API_BASE`/`GITHUB_RAW_BASE`); production
  uses github.com. The design is cached, so a deleted upstream repo leaves the site working.
- The public GitHub repository is private while the scaffold is in flux.
