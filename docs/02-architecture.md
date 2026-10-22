# 02 — Architecture

## Context

```text
        ┌────────────┐   HTTPS    ┌───────────────────────────────┐
        │  Browser   │───────────►│ Caddy (TLS, compression)      │
        └────────────┘            └──────────────┬────────────────┘
                                                   │
                                    ┌──────────────▼────────────────┐
                                    │ web — SvelteKit SSR           │
                                    │ sessions · pages · REST API   │
                                    └───┬───────────┬───────────┬───┘
                                        │           │           │
                         ┌──────────────▼──┐  ┌─────▼─────┐  ┌──▼──────────────┐
                         │ PostgreSQL 16   │  │ artifacts │  │ Forgejo         │
                         │ data · FTS ·    │  │ volume/S3 │  │ hosted git      │
                         │ jobs            │  │           │  │ OAuth2·webhooks │
                         └───────▲─────────┘  └─────▲─────┘  └──▲──────────────┘
                                 │                  │           │
                         ┌───────┴──────────────────┴───────────┴───────┐
                         │ worker — sync · render · index               │
                         │   └── solidcraft-cli in a per-job sandbox    │
                         └──────────────────────▲───────────────────────┘
                                                │ webhook / poll
                                 GitHub · GitLab · Gitea · Codeberg
```

## Components

| Component | Responsibility | State |
|---|---|---|
| **Caddy** | TLS, HTTP/2, static asset caching, request limits, security headers | config only |
| **web** | SSR pages, REST API, sessions, OAuth callbacks, authorization, signed URLs | stateless |
| **worker** | Repository sync, design ingest, sandboxed render, derivative export, search indexing | stateless; leases jobs |
| **PostgreSQL** | Users, repos, projects, versions, artifacts, jobs, reports, audit, FTS | primary data |
| **Forgejo** | Hosted git: users, repos, HTTP/SSH, webhooks, OAuth2 provider, quotas | repos + its DB |
| **Artifacts** | Thumbnails, renders, Open Graph images, STEP/STL, downloaded archives | local volume (S3 later) |
| **`solidcraft-cli`** | Parse, evaluate, render, export; pinned version | binary in worker image |

The web tier never runs the CLI. The worker never serves HTTP. Forgejo never holds site sessions.
Each boundary is deliberate: a compromise of the renderer does not yield sessions or OAuth tokens.

## Stack

| Layer | Choice | Version pin |
|---|---|---|
| Runtime | Node.js LTS | 22.x |
| Web | SvelteKit + `adapter-node` | SvelteKit 2, Svelte 5 |
| Language | TypeScript strict | 5.x |
| DB | PostgreSQL | 16.x |
| SQL access | Drizzle ORM + `postgres` driver | latest compatible |
| Validation | Zod | 3.x |
| Auth | Forgejo OAuth2, GitHub OAuth, `arctic` or hand-rolled PKCE | — |
| Sessions | `__Host-gallery_session`, SHA-256 hashed in DB | — |
| Markdown | `marked` + `sanitize-html` (strict allowlist) | — |
| Queue | `jobs` table + `FOR UPDATE SKIP LOCKED` | — |
| Logs | `pino` JSON to stdout | — |
| Metrics | `prom-client`, `/metrics` on web and worker | — |
| Tests | Vitest, Playwright, k6 | — |
| Git host | Forgejo | current stable |
| Reverse proxy | Caddy | 2.x |
| Sandbox | `nsjail` (preferred) or `bubblewrap` | distro package |
| CLI | `solidcraft-cli` | pinned per release |

## Repository layout (the application)

```text
solidcraft-gallery/
  apps/
    web/                 # SvelteKit app: routes, API, auth
    worker/              # job runner
  packages/
    core/                # domain rules: slugs, visibility, validation
    db/                  # schema, migrations, typed queries
    git/                 # Forgejo API, GitHub/GitLab/Gitea adapters
    render/              # CLI invocation, sandbox, artifact naming
    search/              # index queries, ranking
    ui/                  # Svelte components, design tokens
  infra/
    compose.yaml
    caddy/Caddyfile
    worker/Dockerfile
    web/Dockerfile
  scripts/
    craftpub             # author CLI: lean, validate, publish
    seed-dev.ts
  docs/                  # this plan
  fixtures/              # real .solidcraft test files
```

Feature work lands vertically: migration + query + route + test in one PR.

## Deployment topology

| Service | Image | Port | Volume |
|---|---|---|---|
| `caddy` | `caddy:2-alpine` | 80/443 | `caddy_data` |
| `web` | built `apps/web` | 3000 (internal) | — |
| `worker` | built `apps/worker` | — | `artifacts` (shared, read-only in web) |
| `forgejo` | `codeberg.org/forgejo/forgejo` | 3000 internal, 2222 SSH | `forgejo_data` |
| `postgres` | `postgres:16-alpine` | 5432 internal | `pgdata` |
| `minio` (optional) | `minio/minio` | 9000 internal | `minio_data` |

Two hostnames:

- `gallery.example` → web
- `git.gallery.example` → Forgejo

Separate hostnames avoid cookie and path conflicts and let Forgejo serve its own UI and git
endpoints. Caddy terminates TLS for both.

## Request flows

### Public page

```text
GET /:owner/:slug
  → web loads project, latest ready version, artifacts, tags
  → 200 SSR HTML (no JS required)
  → images from /media/:artifactId (public cache: immutable, keyed by sha256)
```

### Publish (hosted)

```text
POST /api/v1/projects/:id/publish  (multipart: design file, optional tag, message)
  → auth, ownership, size/format validation
  → strip cache/*          (server-side, in memory)
  → create commit with a scoped git push (Forgejo API fallback for single files)
  → insert version(status=pending), enqueue job(version.ingest)
  → 202 { versionId, statusUrl }
worker:
  → fetch committed bytes, sha256, parse metadata
  → render 3 views + eval + STEP/STL
  → upsert artifacts, index, version.status=ready
  → project.status=ready
```

### External repository push

```text
GitHub/GitLab/Gitea webhook → POST /webhooks/:provider
  → verify HMAC / secret token
  → resolve repository by external id
  → enqueue repo.sync { repoId, ref, afterSha }
worker:
  → compare last_commit_sha; ignore duplicates/old
  → fetch project.json + design at afterSha (API raw or shallow archive)
  → ingest as above
```

Polling fallback: every 15 minutes, one `repo.poll` job per external repo, conditional request with
`If-None-Match` where the provider supports it.

### Download

```text
GET /:owner/:slug/download?version=v1.2.0&format=solidcraft
  → authorize visibility
  → public: stream committed bytes with immutable cache headers
  → private: signed URL (5 min) or authenticated stream, Cache-Control: private
  → derivative formats served from artifacts, generated on publish
```

## Data flows and ownership

| Data | Source of truth | Derived copy |
|---|---|---|
| Design bytes | git repository | Download proxy cache (optional, keyed by sha256) |
| Metadata | `project.json` + README in repo | DB row for query/speed |
| Versions | git commits/tags | `versions` rows |
| Previews/metrics | computed | `artifacts`, `versions.metrics` |
| Visibility | site DB (hosted) / provider (external) | repo visibility mirrored |
| Users | Forgejo (hosted) / GitHub (external) | `users`, `identities` |
| Sessions/tokens | site DB | — |

If the DB is lost, projects can be re-indexed from repositories; only site-specific state
(visibility overrides, reports, audit, sessions, favorites) is irrecoverable. Backups cover it.

## Trust boundaries

1. **Internet → Caddy/web.** Untrusted input: query strings, uploads, OAuth callbacks, webhooks,
   Markdown. Validate and rate-limit at the edge and in the route.
2. **web → Forgejo.** Uses a service account for repository creation and a per-user token for
   actions that must be attributed; never trusts a client-provided repository id without an
   ownership check.
3. **worker → design file.** Highest risk. A separate container, a per-job sandbox, no network,
   memory/CPU/time limits, read-only root, tmpfs workdir.
4. **worker → external providers.** SSRF-sensitive. Only allowlisted schemes/hosts for cloning;
   block private, loopback and link-local ranges.
5. **web/worker → artifacts.** Public artifacts are content-addressed and immutable; private
   artifacts are never written to the public cache path.

## Failure modes

| Failure | Impact | Behaviour |
|---|---|---|
| Forgejo down | No new hosted pushes; existing pages fine | Publish returns 503 with retry hint; worker backs off |
| PostgreSQL down | Site unavailable | Caddy returns 503; health check fails; alert |
| Worker down | Pages stale, no renders | Queue grows; `processing` states; alert on depth > 100 |
| Artifact volume full | Renders fail, downloads fail | Alert at 80%; refuse new publish at 95% |
| CLI crash/timeout | One version fails | Job retries 3×; version `failed`; owner sees reason; queue continues |
| External provider rate limit | Sync delayed | Backoff; poll schedule; manual "Sync now" |
| Webhook secret mismatch | Push not indexed | 401; audit event; manual sync |
| Bad migration | Site down | Forward-only migrations; deploy runs `migrate` before swap; rollback = restore backup |

## Scaling path (post-MVP)

1. **Artifacts → S3** (MinIO or Backblaze B2) when the volume exceeds ~50 GB or web/worker split hosts.
2. **Worker replicas** (2–4) with the same Postgres queue; `SKIP LOCKED` gives safe parallelism.
3. **Read replica** for search/browse if Postgres CPU saturates.
4. **Meilisearch/Typesense** when FTS ranking or facets become the bottleneck.
5. **Separate render hosts** with a GPU only if large-assembly renders become a product requirement.
6. **CDN** for `/media/*` public artifacts; private remains origin-signed.

## Environments

| Environment | Purpose | Data |
|---|---|---|
| `dev` | Local Compose, seeded fixtures, Mailpit | Fake users, 5 fixture designs |
| `staging` | Production-like, invite-only, nightly reset | Synthetic + a few opted-in projects |
| `prod` | Beta | Real data, backups, alerts |

Configuration is environment variables only; no secrets in the repository. See
[12 — Operations](12-operations.md).
