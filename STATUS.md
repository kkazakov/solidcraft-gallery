# Implementation status

**Updated:** 2026-10-22 · **Milestone:** M0 complete, M1 slice + M2 gallery · **Next:** Forgejo OAuth, external repos, nsjail

This file records what actually runs, not what is planned. The plan remains in
[README.md](README.md) and [docs/14-roadmap.md](docs/14-roadmap.md).

## Running today

| Piece | State | Verified by |
|---|---|---|
| pnpm workspace, TypeScript, ESLint, Prettier, Vitest | done | `pnpm lint`, `pnpm check`, `pnpm test` |
| `@gallery/core` — manifest, slugs, visibility, errors, limits, session tokens | done | 33 unit tests |
| `@gallery/design` — read ZIP/JSON, strip `cache/*`, real fixture | done | 11 unit tests |
| `@gallery/db` — schema, migrations, queue, users/sessions, projects/versions, search | done | 16 integration tests on PostgreSQL 16 |
| `@gallery/git` — local repository, commit, read at commit, tag | done | 5 tests against real git |
| `@gallery/storage` — content-addressed artifacts, atomic writes | done | 2 tests |
| `@gallery/render` — nsjail plan, direct plan, no-shell runner | done | 12 tests |
| `@gallery/web` — SSR shell, auth, dashboard, publish, public page, **gallery, search, sitemap, visibility** | done | end-to-end curl flow |
| `@gallery/worker` — job loop, retries, render handler | done | real CLI render in 0.6–0.8 s |
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

## Not implemented (next)

1. Forgejo OAuth login (dev sign-in exists), invites, API tokens.
2. Forgejo repository creation/push; the local backend is the current hosted backend.
3. Webhook verification, `repo.sync`, `version.ingest`, external GitHub/GitLab/Gitea repositories.
4. nsjail wiring in the worker image; the direct renderer is development-only.
5. Cursor pagination (search/home currently use `?page=N`), `pg_trgm` typo tuning, featured-content
   admin UI.
6. Pre-receive lean hook, quotas, moderation and reports.

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
- The public GitHub repository is private while the scaffold is in flux.
