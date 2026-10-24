# 06 — Ingest and rendering pipeline

The pipeline turns a git commit into a public page. It is asynchronous, idempotent, retryable and
sandboxed. Nothing in this document runs in the web request path except enqueueing a job.

## Stages

```text
push / tag / publish / poll
        │
        ▼
  repo.sync  ──►  version.ingest  ──►  version.render  ──►  ready
   (git)          (bytes, parse)       (CLI, artifacts,
                                        search index)
```

| Job | Input | Output | Retry |
|---|---|---|---|
| `repo.sync` | `{repoId, ref, afterSha, deliveryId?}` | new `versions` in `pending`, enqueue ingest | 3×, 30 s/2 m/10 m |
| `version.ingest` | `{projectId, versionId, commitSha}` | version row validated + design bytes cached, enqueue render | 3×, 1 m/5 m/15 m |
| `version.render` | `{versionId}` | artifacts, metrics, FTS, `status = ready` | 3×, 2 m/10 m/30 m |
| `repo.poll` | `{repoId}` | maybe enqueue sync | 3× |
| `artifact.gc` | `{before}` | delete unreferenced artifacts | 3× |
| `search.reindex` | `{}` | rebuild FTS for all public projects | 1× |

A job carries ids, never file bytes. Workers claim with `FOR UPDATE SKIP LOCKED`
([04 — Data model](04-data-model.md#jobs)) and hold a lease for 10 minutes.

Payloads:

```json
{"kind":"repo.sync",       "payload":{"repoId":"…","ref":"refs/heads/main","afterSha":"…","deliveryId":"…"}}
{"kind":"version.ingest",  "payload":{"projectId":"…","versionId":"…","commitSha":"…"}}
{"kind":"version.render",  "payload":{"versionId":"…","designSha256":"…"}}
{"kind":"repo.poll",       "payload":{"repoId":"…"}}
{"kind":"artifact.gc",     "payload":{"before":"2026-10-01T00:00:00Z"}}
{"kind":"search.reindex",  "payload":{}}
```

Dedupe keys: `repo.sync` on `(repoId, afterSha)`; `version.ingest` and `version.render` on
`versionId`; `repo.poll` on `repoId` with a 15-minute window. A duplicate enqueue is a no-op.

## `repo.sync`

1. Verify the delivery is for a connected repository; ignore unknown ids and ping events.
2. Deduplicate on `(repoId, afterSha)` and on `last_commit_sha`.
3. Determine the project's primary design path at that commit (`project.json` or the single
   `*.solidcraft`).
4. Upsert a `versions` row per new commit that changes the design or manifest (`pending`).
5. Update `repos.last_commit_sha`, `last_synced_at`, `is_private`.
6. Enqueue one `version.ingest` per new version (newest first).

A branch push of ten commits that touch only README produces one version (the tip). Commits that do
not change the design or `project.json` do not create versions.

## `version.ingest`

### 1. Fetch

Hosted: read the blob from Forgejo at the commit (`/api/v1/repos/{owner}/{repo}/raw/{path}?ref={sha}`)
with a short-lived token, or `git cat-file` in a cached bare clone. External: provider raw API or a
shallow archive; never a full clone for a single file.

Hard limits before reading the body:

| Check | Limit |
|---|---|
| Content-Length | 25 MB |
| Streamed bytes | 25 MB (abort past) |
| Fetch timeout | 20 s |
| Redirects | 0 for API calls; raw hosts are allowlisted |
| Content-Type | ignored; the signature decides |

### 2. Hash and detect

- `sha256(bytes)` is the version's design hash and the artifact cache key.
- ZIP if the first four bytes are `PK\x03\x04`; otherwise UTF-8 JSON.
- Parse `container.json` (format `solidcraft-container/1`) and `document.json`; for JSON, parse the
  document directly.
- Reject path traversal, duplicate entries, ZIP64, more than 10,000 entries, or expanded size over
  512 MiB **before** extracting (the upstream reader already enforces this; enforce the site's
  25 MB on the compressed file first).

### 3. Extract metadata (in memory, capped)

| Field | Source |
|---|---|
| Title / description / tags / license | `project.json`, with fallbacks from [03](03-repo-format.md) |
| Parameters | `document.json` parameter names (max 200, each ≤ 64 chars) |
| Feature names/types | timeline features (max 500) |
| Body names | model bodies (max 500) |
| Materials | physical material names (max 50) |
| Dependencies | linked component paths in the document |

`keywords` is the joined, lowercased set, capped at 4 KB.

### 4. Validate

| Code | Condition |
|---|---|
| `design_missing` | declared path absent |
| `design_unreadable` | not a container/JSON, or the document fails to parse |
| `design_too_large` | > 25 MB |
| `manifest_invalid` | `project.json` fails the schema |
| `license_missing` / `license_invalid` | public visibility requested |
| `path_escape` | a path leaves the repository |
| `dependencies_missing` | linked components outside the repo (warning, not failure) |

A failure writes `versions.status = failed`, `error_code`, a human `error_detail` (no stack traces,
no provider URLs with tokens) and stops.

### 5. Store the snapshot

The committed bytes are not copied into the database. They remain in git; the ingest caches a
**temporary** copy under `work/{versionId}/design.solidcraft` for the render job, deleted after the
job (success or failure). The design hash is stored for cache lookups.

## `version.render`

All CLI work happens here, inside the sandbox.

### Fast path

If the container has `cache/thumbnail.png` (240×150) and no higher-resolution artifact exists for
this `design_sha256`, use it immediately as the card image while the full render runs. It is never
used as the project's hero image.

### Commands

```sh
# three views, transparent-free, no grid/axes
solidcraft-cli snapshot "$DESIGN" --out iso.png   --width 1200 --height 900 --view iso   --no-grid --no-axes
solidcraft-cli snapshot "$DESIGN" --out top.png   --width 1200 --height 900 --view top   --no-grid --no-axes
solidcraft-cli snapshot "$DESIGN" --out front.png --width 1200 --height 900 --view front --no-grid --no-axes

# measurements
solidcraft-cli eval "$DESIGN" --json-out metrics.json

# derivatives
solidcraft-cli run --in "$DESIGN" --out part.step
solidcraft-cli run --in "$DESIGN" --out part.stl
```

`snapshot` uses the GPU when available and the CPU rasterizer otherwise; the worker is CPU-only.
A design with no bodies produces blank images: detect an all-background image and substitute a
“no bodies” placeholder rather than publishing a white rectangle.

### Artifacts

| Kind | Size | Format | Notes |
|---|---|---|---|
| `thumb` | 480×300 | WebP | Card image, derived from `iso` |
| `iso` | 1200×900 | WebP + PNG | Hero |
| `top` | 1200×900 | WebP | Second view |
| `front` | 1200×900 | WebP | Third view |
| `og` | 1200×630 | PNG | Open Graph; ISO render, cropped/padded |
| `step` | — | STEP | Assembly-aware export |
| `stl` | — | STL | Best-effort; assemblies export placed bodies |

Storage keys are content-addressed:

```text
artifacts/sha256/<design-sha>/render-v1/iso.webp
artifacts/sha256/<design-sha>/render-v1/step.step
```

`render-v1` is a settings version. Changing sizes, views or the CLI expands it to `render-v2`; old
artifacts remain valid for old versions and are garbage-collected by age.

A missing STEP/STL export is non-fatal: the version is `ready`, the download option is hidden, and
a warning is recorded.

### Metrics

`eval` JSON is normalized into `versions.metrics` ([04](04-data-model.md#versions)): body count,
volume, area, bounding box, mass when a material is assigned, parameter and feature counts. Values
are rounded for display; the raw JSON is kept in `metrics.raw` (≤ 64 KB) for debugging.

### Index

In one transaction:

1. Upsert `projects` metadata (title, description, readme, tags, license, cover).
2. Set `versions.metrics`, `warnings`, `status = ready`, `indexed_at`.
3. Set `projects.status = ready`; `published_at` on the first ready version.
4. Update `search_vector` (trigger).
5. Enqueue `artifact.gc` if the design hash changed for a previously public version.

The page becomes visible when the transaction commits.

## Sandbox

Each CLI invocation runs under `nsjail` (fallback: `bubblewrap`) with:

| Control | Value |
|---|---|
| Network | none (`--disable_clone_newnet` or an empty netns) |
| User | non-root, unmapped uid |
| Filesystem | read-only root; tmpfs workdir; only the design and output dir writable |
| Memory | 1 GiB (`RLIMIT_AS`) |
| CPU | 1 core, `RLIMIT_CPU` 60 s |
| Processes | 64 |
| File size | 32 MB per output |
| Environment | `HOME`, `TMPDIR`, `PATH` only; no secrets, no DB URL |
| Time | wall clock 60 s, killed with SIGKILL |

The CLI binary and its data files are mounted read-only. The design file is copied in; the output
directory is copied out and validated (PNG/STEP magic, size caps) before storage.

A render failure is isolated: the job fails, the version is marked `failed` with `render_failed` or
`render_timeout`, the queue continues.

## Idempotency and concurrency

- `versions` is unique on `(project_id, commit_sha)`; re-delivery of a webhook is a no-op.
- `version.render` checks `status`: `ready` is a no-op; `running` with a live lease is skipped.
- `repo.sync` is serialized per repo with a partial unique index on queued/running jobs for the same
  repo (or an advisory lock).
- Artifact writes are content-addressed and atomic (`write temp → fsync → rename`).
- Publish uses `Idempotency-Key`; the commit SHA is the second idempotency key.

## Failure taxonomy

| Code | User-facing meaning | Retry |
|---|---|---|
| `fetch_failed` | The repository could not be read | yes |
| `provider_rate_limited` | The provider asked us to slow down | yes, longer backoff |
| `design_missing` | The declared design file is not in the commit | no |
| `design_unreadable` | The file is not a valid SolidCraft design | no |
| `design_too_large` | Over the 25 MB limit | no |
| `manifest_invalid` | `project.json` has invalid fields | no |
| `license_missing` | Public project without a license | no |
| `render_timeout` | Preview took longer than 60 s | yes, smaller views |
| `renderer_outdated` | The design was saved by a newer SolidCraft than the pinned CLI reads | no; upgrade `solidcraft-cli` |
| `render_failed` | The CLI could not render this design | yes (3×) |
| `dependencies_missing` | Linked components are outside the repository | warning |
| `repo_too_large` | Repository over 1 GB | no |

Owner-visible errors are sanitized: no filesystem paths, no tokens, no stack traces. The CLI's own
`error:` line is kept in `versions.error_detail` (with sandbox paths removed), so a format-skew
failure names both the design format and the newest format the renderer understands. The full error
goes to the worker log with the job id.

## Garbage collection

Nightly `artifact.gc`:

1. Delete `work/*` directories older than 24 hours.
2. Delete artifacts not referenced by any version and older than 30 days.
3. Delete `versions` with `status = failed` beyond the latest 5 per project and older than 30 days.
4. Delete expired sessions, old jobs, and audit rows past retention.

Storage is content-addressed, so a blob shared by two projects survives until both references are
gone.

## Observability

Metrics per job kind: claimed, succeeded, failed, duration histogram, queue depth, oldest queued
age. Labels are low-cardinality (`kind`, `status`, `error_code`); never project ids.

Logs: one JSON line per job transition with `job_id`, `kind`, `repo_id` (hashed), `version_id`,
`duration_ms`, `error_code`. Design contents and tokens never appear.

Alerts:

- oldest queued job > 10 min
- render failure rate > 5% over 15 min
- queue depth > 100
- artifact volume > 80%
