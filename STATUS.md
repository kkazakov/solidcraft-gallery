# Implementation status

**Updated:** 2026-10-22 · **Milestone:** M0 (scaffold) · **Next:** M1 (auth, hosted publish, ingest)

This file records what actually runs, not what is planned. The plan remains in
[README.md](README.md) and [docs/14-roadmap.md](docs/14-roadmap.md).

## Running today

| Piece | State | Verified by |
|---|---|---|
| pnpm workspace, TypeScript, ESLint, Prettier, Vitest | done | `pnpm lint`, `pnpm check`, `pnpm test` |
| `@gallery/core` — manifest, slugs, visibility, errors, limits | done | 30 unit tests |
| `@gallery/design` — read ZIP/JSON, strip `cache/*` | done | 9 unit tests |
| `@gallery/db` — schema, migration runner, `SKIP LOCKED` queue | done | migration applied twice to PostgreSQL 16; queue integration tests |
| `@gallery/render` — sandbox argv, render plan | plan only | 6 unit tests; execution arrives in M1 |
| `@gallery/web` — SSR shell, health/readiness, search placeholder | done | `pnpm build`; curl smoke tests |
| `@gallery/worker` — job loop, ping handler, retries, shutdown | done | ping processed end-to-end against PostgreSQL |
| `craftpub` — `lean`, `validate`, `inspect` | done | fixtures and failure exits exercised |
| Compose (Caddy, web, worker, Postgres, Forgejo, Mailpit) | config valid | `docker compose config --quiet` |
| CI — lint, check, test, build, migrate, DB tests | done | workflow written; first run on push |
| `AGENTS.md` | done | reviewed against the repository |

## Not implemented (M1)

1. Forgejo OAuth login, sessions, users, invites and API tokens.
2. Hosted project creation, publish, lean strip, commit/tag push.
3. Webhook verification and `repo.sync` / `version.ingest` / `version.render`.
4. Actual `solidcraft-cli` invocation (the render plan exists; the worker handler refuses).
5. Public gallery, project pages, search index and media routes.
6. Pre-receive lean hook, quotas and moderation.

## Quick start

```sh
pnpm install
docker compose -f infra/compose.yaml up -d postgres
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm db:migrate
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm --filter @gallery/db test
pnpm dev:web          # http://localhost:5173
pnpm craftpub validate fixtures/box.lean.solidcraft
```

## Known gaps and risks

- Fixtures are **synthetic**: their document bodies are not evaluable by the real CLI. Add real
  designs under `fixtures/real/` with provenance before trusting render tests.
- No CSP yet; the baseline headers are in `apps/web/src/hooks.server.ts`.
- The worker image uses `tsx` at runtime and does not yet contain `solidcraft-cli` or `nsjail`.
- The web image copies the whole workspace; it is correct but larger than necessary.
- Forgejo is pinned to major tag `9`; confirm the current stable tag before the first deployment.
- The public GitHub repository is private while the scaffold is in flux.

## Next session

Start M1 in this order: Forgejo OAuth spike → sessions/users → repo creation → publish with lean
strip → `version.render` against a real fixture → minimal project page. Keep the first three
commits small and push after each.
