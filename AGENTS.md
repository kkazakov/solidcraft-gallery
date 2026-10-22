# AGENTS.md

## 1. Project Overview

SolidCraft Gallery is a git-backed public gallery and private workspace for SolidCraft `.solidcraft`
designs: previews, search, versions, and downloads. Stack: Node 22, pnpm 10, SvelteKit 3 / Svelte 5,
TypeScript 6, PostgreSQL 16, Forgejo, Vitest. You are implementing and reviewing this repository;
read `docs/00-decisions.md` before changing a contract. Refer to this project as “SolidCraft Gallery”.

## 2. Commands

```sh
pnpm install
pnpm dev:web                 # http://localhost:5173
pnpm dev:worker              # requires DATABASE_URL
pnpm test                    # all workspaces; DB integration skips without DATABASE_URL
pnpm --filter @gallery/core test
pnpm --filter @gallery/core test -- src/slug.test.ts   # single file
pnpm check                   # tsc + svelte-check for every workspace
pnpm lint                    # eslint + prettier
pnpm build                   # adapter-node build into apps/web/build
pnpm db:migrate              # requires DATABASE_URL
pnpm craftpub validate fixtures/box.lean.solidcraft
pnpm craftpub lean fixtures/box.cached.solidcraft --out /tmp/lean.solidcraft
pnpm invites create --by <admin> --note <text> --uses <n> --days <n>
docker compose -f infra/compose.yaml up -d --build
docker compose -f infra/compose.yaml config --quiet
```

Local database for integration tests:

```sh
docker compose -f infra/compose.yaml up -d postgres
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm db:migrate
DATABASE_URL=postgres://gallery:gallery@localhost:5432/gallery pnpm --filter @gallery/db test
```

## 3. Architecture

| Path | Purpose |
|---|---|
| `apps/web` | SvelteKit SSR pages, OAuth login/callback and `/api/v1` routes; the only HTTP surface |
| `apps/worker` | Postgres job loop and nsjail renderer; claims jobs with `FOR UPDATE SKIP LOCKED` |
| `packages/core` | Pure domain: manifest schema, slugs, visibility, errors, limits |
| `packages/db` | SQL schema/migrations, query helpers, job queue, invites and public search; the only place SQL lives |
| `packages/design` | Reads `.solidcraft` containers and strips `cache/*` |
| `packages/git` | Local git backend, read-only GitHub client and the Forgejo contents API |
| `packages/storage` | Content-addressed artifact store under `DATA_DIR/artifacts` |
| `packages/render` | Builds and runs the nsjail/direct CLI plans with no shell |
| `infra` | Compose, Caddy, Postgres init |
| `docs` | The implementation plan and the decision record |

Keep dependencies pointing downward: `apps/* → packages/*`; `core` imports nothing local; `db`
and `design` may import `core`; no package imports an app.

## 4. Conventions

- Server-only code lives in `src/lib/server` or `+page.server.ts`. Never import `@gallery/db` into a
  `.svelte` file.
- OAuth is `src/lib/server/oauth.ts`: PKCE S256 plus a signed HttpOnly transaction cookie. Never trust
  a provider redirect target; `safeRedirect` is mandatory. Access tokens are not persisted yet.
- When `INVITE_REQUIRED=1`, only a first identity needs an invite; codes are SHA-256 hashed and consumed
  atomically. `ADMIN_USERNAMES` promotes matching accounts on sign-in. Admin CLI: `pnpm invites`.
- Every project read/write goes through `can()` in `@gallery/core`; invisible resources are `404`,
  never `403`.
- Validate external input with Zod at the boundary and throw `AppError` for the API envelope.
- `.solidcraft` bytes are untrusted. Never spawn the CLI directly; use `packages/render` so the
  design runs in nsjail with no network. No shell strings, no user paths in argv.
- The worker image builds nsjail 3.4. `SANDBOX_MODE=direct` is development-only; production/compose
  uses `nsjail`, which needs `SYS_ADMIN` + `seccomp=unconfined` on the container and a CLI mounted at
  `/usr/local/bin/solidcraft-cli`.
- SQL belongs in `packages/db`; migrations are append-only (`000N_name.sql`) and need a test.
- Tests are `*.test.ts` next to the code. DB integration tests are `describe.skip` without
  `DATABASE_URL`.
- Public pages are SSR with `csr = false`; interactive features opt in per route.

```ts
import { AppError, can } from '@gallery/core';

if (!can(project, viewer, 'view')) throw new AppError('not_found', 'No such project');
```

## 5. Boundaries

- NEVER commit `.env`, tokens, keys, or a real user design without explicit permission.
- NEVER run migrations against production, and never write a destructive migration without a human.
- NEVER invoke `solidcraft-cli`, `git`, or `unzip` outside the sandbox/render package (M1+).
- NEVER push to an external repository; the site is read-only for bring-your-own git.
- NEVER change a decision in `docs/00-decisions.md`; add a superseding decision instead.
- DO NOT change the schema without a migration, a test, and a corresponding doc update.
- REQUIRE HUMAN CONFIRMATION for: rotating secrets, changing the GitHub repository visibility,
  deleting data, major dependency upgrades, and editing `.github/workflows`.

## 6. Gotchas

- SvelteKit 3 has **no `svelte.config.js`** and **no `$lib` alias**. Pass `adapter` and `preprocess`
  to `sveltekit({...})` in `vite.config.ts`; import `Handle` from `@sveltejs/kit/hooks`; use relative
  imports for local server modules; `tsconfig.json` extends `"$app/tsconfig"`.
- pnpm is strict: a root script importing a workspace package needs that package in the root
  `devDependencies` (that is why `@gallery/core`, `@gallery/design` and `fflate` are there).
- A `.solidcraft` is a ZIP **or** pretty JSON; detect it by signature, never by extension.
- `cache/*` is stripped before commit; the embedded 240×150 thumbnail is therefore absent.
- `public_projects` is the only listing source; do not query `projects` directly for public pages.
- Public search is `searchPublicProjects` in `packages/db/src/search.ts`: dual `simple`/`english`
  FTS plus a trigram fallback. Keep private projects out by querying the view.
- Beta pagination is `limit`/`offset` (`?page=N`); the cursor design in `docs/09-search.md` is the
  upgrade path, not the current code.
- Local projects are real git repositories under `DATA_DIR/repos/<owner>/<slug>`; the web tier writes
  them and the worker reads them. With `FORGEJO_ADMIN_TOKEN`, new hosted projects use Forgejo instead;
  both cache the lean design for rendering when needed.
- External GitHub designs are cached as lean bytes in artifact storage; `versions.design_key` points
  at them. The worker and downloads must not need GitHub access.
- `SANDBOX_MODE=direct` is a development path. Production uses `nsjail`; the worker container needs
  `SYS_ADMIN` and an unconfined seccomp profile, while the jailed process has no caps or network.
- nsjail runs with `--chroot /` (read-only image root), `--disable_proc`, no network namespace changes,
  and only `/work/out` writable. The CLI is mounted at its final absolute path.
- External sync is synchronous in the web tier (manual or GitHub webhook); there is no `repo.sync`
  worker yet. GitHub URLs are the only accepted source host. Webhooks verify the raw-body HMAC and
  resolve the repository by numeric id, never by a payload URL.
- Forgejo projects are provisioned with the server-side `FORGEJO_ADMIN_TOKEN`, not user OAuth tokens.
  Publishing uses contents calls; visibility calls Forgejo before the DB update. The worker must read
  the cached `versions.design_key`, never Forgejo directly.
- `jobs.attempts` increments on claim; `failJob` needs the job's `max_attempts`, not a constant.
- Local ports: web `8080` via Caddy (`5173` dev), Forgejo `8081`, Postgres `5432`.
- Behind a proxy, adapter-node defaults the protocol to `https`; set `PROTOCOL_HEADER=x-forwarded-proto`
  (compose does) or form POSTs fail SvelteKit's origin check.
- SvelteKit 3's `redirect()` refuses external URLs. The OAuth start route returns a raw `303` with a
  `location` header; callback redirects stay relative.
- Forgejo needs two URLs: browser-facing `FORGEJO_PUBLIC_URL` (authorize) and server-to-server
  `FORGEJO_INTERNAL_URL` (token/profile; `http://forgejo:3000` in compose).
- Prettier cannot parse Dockerfiles/Caddyfile; they are in `.prettierignore` on purpose.
