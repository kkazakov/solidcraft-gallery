# 12 — Operations

## Environments

| Environment | Host | Data | Access |
|---|---|---|---|
| `dev` | local Compose | fixtures, Mailpit | developer |
| `staging` | one VPS | synthetic + opted-in projects | team, invite-only |
| `prod` | one VPS (upgrade path: separate worker host) | real | public read, invite write |

Staging runs the same images and migrations as production, with a nightly database reset. No
production data is copied to staging; fixtures are generated.

## Compose topology

```text
caddy        :80/:443     TLS, compression, body limits, security headers
web          :3000        SvelteKit SSR + API
worker       (no ports)   jobs, CLI, sandbox
forgejo      :3000 internal, :2222 SSH (optional)
postgres     :5432 internal
minio        :9000 internal (optional; local volume by default)
```

Volumes: `pgdata`, `forgejo_data`, `artifacts`, `caddy_data`, `caddy_config`.
Networks: `edge` (caddy, web, forgejo), `internal` (web, worker, postgres, forgejo, minio).

The worker has no inbound ports. The worker container needs `SYS_ADMIN` and `seccomp=unconfined` so
nsjail can create namespaces; mount the pinned CLI at `/usr/local/bin/solidcraft-cli`. Forgejo is
reachable publicly only for git over HTTPS
(`git.gallery.example`); its admin UI is restricted by Forgejo itself and optionally by Caddy IP
rules.

## Configuration

All configuration is environment variables. Secrets are mounted as files in production
(`*_FILE` variants) or provided by the orchestrator; never committed.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `PUBLIC_ORIGIN` | yes | — | `https://gallery.example`; used for OAuth, CSP, absolute URLs |
| `DATABASE_URL` | yes | — | `postgres://gallery:…@postgres:5432/gallery` |
| `SESSION_SECRET` | yes | — | 32+ bytes; rotates sessions on change |
| `TOKEN_ENC_KEY` | yes | — | base64 32 bytes; AES-256-GCM for provider tokens |
| `SIGNED_URL_SECRET` | yes | — | HMAC for private media |
| `FORGEJO_PUBLIC_URL` | yes | — | browser-facing `https://git.gallery.example` |
| `FORGEJO_INTERNAL_URL` | no | public URL | server-to-server URL, e.g. `http://forgejo:3000` |
| `FORGEJO_CLIENT_ID` / `_SECRET` | yes | — | OAuth2 app |
| `FORGEJO_ADMIN_TOKEN` | no | — | provisioning token for hosted repos; unset uses local git |
| `FORGEJO_DISABLE_REGISTRATION` | no | `true` | set `false` for Forgejo self-registration |
| `FORGEJO_ADMIN_TOKEN` | no | — | provisioning fallback; scoped, rotatable |
| `GITHUB_CLIENT_ID` / `_SECRET` | yes | — | OAuth for external repos |
| `GITHUB_WEBHOOK_SECRET` | no | — | GitHub push webhook HMAC; disabled when unset |
| `ARTIFACT_DIR` | yes | `/var/lib/gallery/artifacts` | local driver |
| `STORAGE_DRIVER` | no | `local` | `local` or `s3` |
| `S3_ENDPOINT` / `_BUCKET` / `_KEY` / `_SECRET` | if s3 | — | MinIO/B2 |
| `SOLIDCRAFT_CLI` | yes | `/usr/local/bin/solidcraft-cli` | pinned binary |
| `SOLIDCRAFT_CLI_VERSION` | yes | — | displayed in admin, checked at boot |
| `MAX_DESIGN_BYTES` | no | `26214400` | 25 MB |
| `MAX_REPO_BYTES` | no | `1073741824` | 1 GB |
| `RENDER_TIMEOUT_SECONDS` | no | `60` | sandbox wall clock |
| `SANDBOX_MODE` | no | `nsjail` | `nsjail`; `direct` only for development |
| `ALLOW_UNSANDBOXED_RENDER` | no | `0` | permits `direct` in production; never enable on the public instance |
| `WORKER_CONCURRENCY` | no | `2` | parallel jobs per worker |
| `WORKER_PAUSED` | no | `0` | kill switch |
| `PUBLISH_DISABLED` | no | `0` | kill switch |
| `INVITE_REQUIRED` | no | `1` | beta |
| `ADMIN_USERNAMES` | no | — | bootstrap promotion |
| `ALLOW_ANY_GIT_HOST` | no | `0` | SSRF trade-off |
| `LOG_LEVEL` | no | `info` | `debug` in staging |
| `SENTRY_DSN` | no | — | scrubbed errors |
| `SMTP_URL` | no | — | notifications, later |

Boot checks: required variables present, CLI executable and `--version` matches the pin, artifact
directory writable, database reachable, migration state current. Fail fast, exit non-zero.

## Deploy

1. CI builds `web` and `worker` images tagged with the git SHA; scans dependencies; runs tests.
2. The release job takes a database backup (or verifies the nightly one is < 24 h old).
3. `docker compose pull` on the host.
4. Run migrations in a one-shot container: `node dist/migrate.js`.
5. Start `web` and `worker` with the new tag; wait for `/healthz` and `/readyz`.
6. `caddy reload` (config is mounted).
7. Smoke tests: home 200, search 200, a fixture project page 200, publish dry-run in staging only.
8. If any step fails: redeploy the previous tag. Migrations are forward-only; a destructive
   migration requires an explicit restore plan.

Deploy frequency: on merge to `main` for staging, manual tag for production. No deploy on Fridays
after 15:00.

### Migration policy

- Expand → migrate → contract. Never drop a column in the same release that stops writing it.
- Every migration is reversible in practice by restoring a backup, not by a down script.
- Long locks are forbidden: add nullable columns, backfill in batches, then add constraints
  `NOT VALID` and validate.
- The ORM's generated SQL is reviewed; no `db push` in production.

## Backups

| Data | Method | Frequency | Retention | RPO |
|---|---|---|---|---|
| PostgreSQL | `pg_dump -Fc` to object storage | daily 02:00 | 30 daily, 12 monthly | 24 h |
| Forgejo | `forgejo dump` + `forgejo_data` | daily 02:30 | 30 daily | 24 h |
| Artifacts | `restic`/`rsync` to object storage | daily 03:00 | 30 daily | 24 h (regenerable) |
| Secrets | encrypted escrow (password manager) | on change | — | — |

- Backups are encrypted at rest and stored in a different provider/region than the VPS.
- A monthly **restore drill** restores into a scratch environment, runs migrations, opens a
  project, verifies a render and a private download, and records the time (RTO target: 4 h).
- Database and Forgejo backups are consistent with each other at the commit level; artifacts are
  content-addressed and can be regenerated, so they are the lowest priority.
- A backup is not considered valid until a restore has succeeded.

## Monitoring

| Signal | Source | Alert |
|---|---|---|
| Availability | external probe `/healthz` every minute | 2 failures → page |
| 5xx rate | Caddy/web metrics | > 1% for 5 min |
| Queue depth | `jobs` count queued | > 100 for 10 min |
| Oldest queued | `min(run_at)` | > 10 min |
| Render failures | job outcomes | > 5% over 15 min |
| Publish latency | web histogram | p95 > 30 s |
| DB connections | Postgres exporter | > 80% |
| Disk | node exporter | > 80% warn, > 90% page |
| Certificate | Caddy | < 14 days |
| Backup age | backup job metric | > 36 h |
| Forgejo health | `/api/healthz` | 2 failures |

Dashboards: overview (traffic, publishes, queue), pipeline (render durations/failures), storage.

## Logging

- JSON to stdout, collected by the platform (journald/Docker logging driver → Loki or a hosted
  service).
- Fields: `ts`, `level`, `msg`, `request_id`, `user_id` (internal), `route`, `status`, `duration_ms`,
  and for jobs `job_id`, `kind`, `version_id`, `error_code`.
- Never: tokens, cookies, design contents, full IPs (truncate to /24 or hash after 30 days).
- Retention 30 days; audit 365 days.
- A request id is returned in the `X-Request-Id` header and shown on error pages.

## Scaling

| Wall | First response | Later |
|---|---|---|
| Render CPU | 2 workers, lower concurrency | dedicated worker host |
| Postgres CPU | indexes, `work_mem`, read replica | split search |
| Artifact disk | move to S3 | CDN for public media |
| Forgejo load | separate host | managed git |
| Traffic | Caddy cache, SSR cache for public pages | CDN |

The web tier is stateless; sessions live in Postgres. Any instance can serve any request. The
worker scales horizontally because jobs are claimed with `SKIP LOCKED`.

## Costs (beta estimate)

| Item | Monthly |
|---|---|
| VPS 4 vCPU / 8 GB / 160 GB NVMe | €25–40 |
| Object storage + egress (backups) | €5–10 |
| Domain + DNS | €1 |
| Email (transactional, later) | €0–10 |
| Monitoring (self-hosted) | €0 |
| **Total** | **€30–60** |

Renders are CPU-bound but cached by design hash; the dominant cost is storage and page traffic, not
compute, at beta scale.

## Maintenance calendar

| Cadence | Task |
|---|---|
| Daily | Backup status, alerts, queue check (automated) |
| Weekly | Dependency PRs, zero-result search review, report queue |
| Monthly | Restore drill, access review, certificate check, cost review |
| Quarterly | Secret rotation (session/signed-url), Forgejo upgrade, load test |
| Per CLI release | Pin bump in staging, golden-image diff, staged re-render |

## Runbooks

### R1 — Queue is backing up

1. Check `WORKER_PAUSED`, worker container status, and `jobs` counts by status.
2. Inspect the oldest running job's lease; if stale (> 10 min) the reaper should requeue it.
3. Check disk and database latency; a full disk stalls artifact writes.
4. Scale `WORKER_CONCURRENCY` to 4 temporarily; watch CPU.
5. If a poison job is looping, mark it `dead` and move on; capture its payload for a fixture.

### R2 — Renders fail for one design

1. Fetch the job's `error_code`; `render_timeout` vs `render_failed` vs `design_unreadable`.
2. Reproduce locally with the same CLI version and the committed bytes.
3. If the design is valid but slow, raise the timeout for that job only; do not raise the global
   default without a load test.
4. If the CLI crashes, pin the previous CLI version, requeue, and report upstream with a minimal
   file.

### R3 — Disk almost full

1. `artifact.gc` manually; remove `work/*` older than 1 h.
2. Move artifacts to S3 (`STORAGE_DRIVER=s3`) with a dual-read window.
3. Prune old job rows and Postgres WAL if archiving is off.
4. Set `PUBLISH_DISABLED=1` until usage is below 80%.

### R4 — Forgejo down

1. `docker compose ps forgejo`; check its database and logs.
2. Publish returns 503; existing pages and downloads continue.
3. Restart Forgejo; verify `/api/healthz` and a clone.
4. Requeue failed `repo.publish`/`repo.sync` jobs (idempotent).

### R5 — Suspected token compromise

1. Revoke the user's sessions and tokens; disable the identity.
2. Rotate `TOKEN_ENC_KEY` if the database is believed exposed; re-encrypt remaining tokens.
3. Review `audit_log` and Forgejo audit for repository changes.
4. Notify the user; force re-authentication.

### R6 — Private project leaked

1. Set `visibility=private`, purge CDN/cache entries, rotate signed-url secret.
2. Identify the cause (query missing the view, cache key collision, webhook visibility bug).
3. Add a regression test; audit all routes for the predicate.
4. Notify the owner if third parties may have accessed it.

### R7 — Restore from backup

1. Provision a scratch PostgreSQL, restore the latest dump, run migrations.
2. Restore Forgejo dump into a scratch instance; verify a clone.
3. Point a staging web at both; open a public and a private project; download and render.
4. Record actual RTO; promote to production only after verification.

## Kill switches

| Switch | Effect |
|---|---|
| `PUBLISH_DISABLED=1` | Publish returns 503; existing data unaffected |
| `WORKER_PAUSED=1` | Workers stop claiming; queue grows |
| Forgejo repository disable | Stops pushes for one repo |
| Project `quarantined` | Hidden from everyone but owner/admin |
| User `suspended_at` | Sessions/tokens revoked, projects hidden |

## Status page

A static status page (or a hosted service) reports availability and incidents. It is linked from
error pages and the footer, and is hosted separately from the VPS it monitors.
