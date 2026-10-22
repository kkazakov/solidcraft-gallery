# 04 — Data model

PostgreSQL 16. The full DDL is [appendix/schema.sql](appendix/schema.sql); this document explains
the entities, invariants and lifecycle. The database is site state, not the design store: designs,
metadata and versions are reconstructable from repositories. Sessions, tokens, reports and audit
are not.

## Entity map

```text
users ──1:N── identities          (Forgejo / GitHub accounts)
  │
  ├──1:N── sessions               (browser sessions)
  ├──1:N── api_tokens             (PATs for the REST API)
  ├──1:N── repos                  (hosted or external)
  │          │
  │          └──1:1── projects
  │                       │
  │                       ├──1:N── versions ──1:N── artifacts
  │                       ├──1:N── reports
  │                       └──N:M── favorites (users)
  └──1:N── audit_log
```

## Tables

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `username` | citext unique | 3–32 chars, `[a-z0-9-]`; collisions resolved with a suffix |
| `email` | citext unique nullable | from the identity provider; never shown publicly |
| `display_name` | text | defaults to username |
| `avatar_url` | text | provider avatar, proxied or hotlinked per policy |
| `role` | enum `user\|admin` | admin is manual |
| `suspended_at` | timestamptz | non-null suspends: sessions/tokens revoked, projects hidden |
| `created_at`, `updated_at`, `last_seen_at` | timestamptz | |

### `identities`

One row per external account linked to a user. A user may have Forgejo and GitHub identities.

| Column | Type | Notes |
|---|---|---|
| `provider` | enum `forgejo\|github\|gitlab\|gitea` | `gitlab` is **later** |
| `subject` | text | provider's stable user id |
| `username` | text | provider handle at link time |
| `access_token_enc` | bytea | AES-256-GCM; null when the provider grants no reusable token |
| `refresh_token_enc` | bytea | optional |
| `scopes` | text[] | recorded for audit |
| `expires_at` | timestamptz | |

Unique `(provider, subject)`. A user can have at most one identity per provider.

### `invites`

| Column | Type | Notes |
|---|---|---|
| `code_hash` | bytea unique | SHA-256 of the invite code; the raw code is shown once |
| `created_by` | uuid FK users | |
| `note` | text | who it is for, free text |
| `max_uses` | int | default 1 |
| `uses` | int | incremented on acceptance |
| `expires_at` | timestamptz | default 14 days |
| `revoked_at` | timestamptz | |

### `sessions`

| Column | Type | Notes |
|---|---|---|
| `token_hash` | bytea unique | SHA-256 of the 256-bit cookie value |
| `user_id` | uuid FK | cascade delete |
| `expires_at` | timestamptz | 30 days, sliding on use (max 90) |
| `ip` | inet | hashed or truncated after 30 days |
| `user_agent` | text | truncated to 300 chars |

### `api_tokens`

| Column | Type | Notes |
|---|---|---|
| `name` | text | user label |
| `prefix` | text | first 12 chars, shown in the UI |
| `token_hash` | bytea unique | SHA-256; the raw token is shown once |
| `scopes` | text[] | `read`, `write` |
| `expires_at` | timestamptz | optional |
| `revoked_at` | timestamptz | soft revoke |

### `repos`

| Column | Type | Notes |
|---|---|---|
| `owner_id` | uuid FK users | |
| `provider` | enum `forgejo\|github\|gitlab\|gitea\|codeberg` | `codeberg` maps to Gitea API |
| `external_id` | text | provider repo id; unique with provider |
| `url` | text | normalized HTTPS clone/browse URL |
| `default_branch` | text | default `main` |
| `is_private` | boolean | mirrors provider visibility |
| `token_enc` | bytea | external private read token (later); null for public |
| `webhook_secret_enc` | bytea | per-repo HMAC secret for external webhooks |
| `last_commit_sha` | text | 40 or 64 hex chars; last indexed commit |
| `last_synced_at` | timestamptz | |
| `status` | enum `active\|error\|disabled` | |
| `error` | text | last sync error, owner-visible |

Unique `(provider, external_id)` and `(owner_id, url)`. A user may connect the same repo once.

### `projects`

| Column | Type | Notes |
|---|---|---|
| `repo_id` | uuid FK unique | one project per repo in v1 |
| `owner_id` | uuid FK | denormalized for listing |
| `slug` | citext | unique per owner; derived from title, editable |
| `title` | text | 1–120 |
| `description` | text | ≤ 2,000 |
| `readme` | text | raw Markdown, capped 200 KB |
| `readme_html` | text | sanitized HTML cache, regenerated on ingest |
| `keywords` | text | extracted parameter/feature/body names, ≤ 4 KB |
| `license` | text | SPDX; null until resolved |
| `design_path` | text | primary design path in the repo |
| `cover_key` | text | artifact storage key for the chosen cover |
| `visibility` | enum `public\|unlisted\|private` | default `private` until first ready version |
| `status` | enum `pending\|indexing\|ready\|error\|quarantined` | |
| `tags` | text[] | ≤ 10, validated |
| `featured` | boolean | admin-controlled |
| `downloads` | bigint | incremented asynchronously |
| `search_vector` | tsvector | trigger-maintained |
| `created_at`, `updated_at`, `published_at` | timestamptz | |
| `deleted_at` | timestamptz | soft delete; all listings exclude it |

Constraints:

- `unique (owner_id, slug)`
- `visibility = 'public'` requires `license is not null`, `status = 'ready'`, `featured` irrelevant
- `status = 'quarantined'` forces `visibility = 'private'` in the admin action, not a constraint
- tags are normalized to lowercase before write

Indexes:

- `(visibility, status, published_at desc, id desc)` for browse
- GIN on `tags`
- GIN on `search_vector`
- `pg_trgm` on `title` for fuzzy autocomplete
- `(owner_id, updated_at desc)` for the dashboard

### `versions`

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid FK | cascade |
| `commit_sha` | text | 40 or 64 hex chars; unique per project |
| `tag` | text nullable | release tag; unique per project when present |
| `is_release` | boolean | generated column: `tag is not null` |
| `message` | text | first line of the commit message |
| `author_name` | text | commit author |
| `authored_at` | timestamptz | commit time |
| `design_path` | text | path at that commit |
| `design_sha256` | bytea | hash of the committed bytes |
| `design_bytes` | bigint | |
| `lean` | boolean | no `cache/*` entries |
| `status` | enum `pending\|fetching\|rendering\|indexing\|ready\|failed` | |
| `error_code` | text | stable code |
| `error_detail` | text | owner-visible, sanitized |
| `metrics` | jsonb | volume, bbox, bodies, mass, materials |
| `warnings` | jsonb | unresolved links, cache included, etc. |
| `indexed_at` | timestamptz | |

Unique `(project_id, commit_sha)`; partial unique `(project_id, tag) where tag is not null`.
Index `(project_id, authored_at desc)`.

`metrics` shape:

```json
{
  "bodies": 3,
  "volume_mm3": 41234.5,
  "area_mm2": 9812.3,
  "bbox_mm": [120.0, 80.0, 32.5],
  "mass_g": 51.2,
  "material": "PETG",
  "parameters": 7,
  "features": 12
}
```

### `artifacts`

Content-addressed derived files. One row per kind per version.

| Column | Type | Notes |
|---|---|---|
| `version_id` | uuid FK | cascade |
| `kind` | enum `thumb\|iso\|top\|front\|og\|step\|stl\|cover` | |
| `storage_key` | text | `sha256/<hash>/<kind>.<ext>` |
| `sha256` | bytea | content hash; dedupe across projects |
| `bytes` | bigint | |
| `width`, `height` | int | images only |
| `created_at` | timestamptz | |

Unique `(version_id, kind)`. Index `(sha256)` for dedupe and GC.

### `favorites`

`(user_id, project_id)` primary key, `created_at`. Counts are derived on demand for the MVP; add a
counter when the query is hot.

### `reports`

| Column | Type | Notes |
|---|---|---|
| `project_id` | uuid FK | |
| `reporter_id` | uuid FK nullable | anonymous reports allowed |
| `reason` | enum `copyright\|unsafe\|spam\|malformed\|other` | |
| `details` | text | ≤ 2,000 |
| `status` | enum `open\|reviewing\|actioned\|dismissed` | |
| `resolution_note` | text | admin |
| `resolved_by` | uuid FK nullable | |
| `created_at`, `resolved_at` | timestamptz | |

Rate limit: 5 reports per IP per day; deduplicate `(project_id, reporter_id)` open reports.

### `jobs`

| Column | Type | Notes |
|---|---|---|
| `id` | bigserial PK | |
| `kind` | text | `repo.sync`, `version.ingest`, `version.render`, `repo.poll`, `artifact.gc`, `search.reindex` |
| `payload` | jsonb | small; ids, refs, no file bytes |
| `status` | enum `queued\|running\|done\|failed\|dead` | |
| `priority` | int | lower runs first |
| `run_at` | timestamptz | backoff |
| `attempts`, `max_attempts` | int | default 3 |
| `locked_by`, `locked_at` | text, timestamptz | worker id and lease |
| `last_error` | text | |
| `created_at`, `finished_at` | timestamptz | |

Index `(status, run_at, priority)`; partial index on `status = 'queued'`.

Claim query:

```sql
with picked as (
  select id from jobs
  where status = 'queued' and run_at <= now()
  order by priority, run_at
  for update skip locked
  limit 1
)
update jobs j
set status = 'running', locked_by = $1, locked_at = now(), attempts = attempts + 1
from picked
where j.id = picked.id
returning j.*;
```

Lease recovery: a job `running` for more than 10 minutes is returned to `queued` (unless
`attempts >= max_attempts`, then `dead`).

### `audit_log`

`id`, `actor_id` nullable, `action` text, `subject_type`, `subject_id`, `meta jsonb`, `ip inet`,
`created_at`. Append-only. Retained 365 days. Written for: sign-in, token creation/revocation,
project visibility change, publish, quarantine, report resolution, user suspension, admin actions.

### `public_projects` view

`public_projects` is the only source for listings: `visibility = 'public' AND status = 'ready' AND
deleted_at IS NULL`. Queries in route code use the view, not `projects`, so the predicate cannot be
forgotten. It is recreated by the migration that adds columns.

## Lifecycle

### Project

```text
create ──► pending ──► indexing ──► ready
                 │          │
                 └──► error ◄┘
ready ──► quarantined ──► private (admin)
```

- `pending`: repo connected, no successful version.
- `indexing`: first or subsequent version in flight.
- `ready`: at least one `ready` version.
- `error`: latest ingest failed and no ready version exists.
- `quarantined`: hidden; only admins and the owner see a notice.

### Version

```text
pending ──► fetching ──► rendering ──► indexing ──► ready
                 │            │            │
                 └────────────┴────────────┴──► failed
```

`failed` is retryable from the dashboard. A newer commit supersedes an older `failed` version; the
UI shows the latest attempt.

### Job

```text
queued ──► running ──► done
              │
              ├──► failed (retry with backoff) ──► queued
              └──► dead (attempts exhausted)
```

## Retention and deletion

| Data | Retention |
|---|---|
| Deleted project | Soft delete 30 days, then DB cascade + artifact GC + repo archive |
| Failed versions | Latest 5 per project, older than 30 days pruned |
| Artifacts | GC 30 days after the last referencing version is deleted; content-addressed so shared blobs survive |
| Sessions | Expired rows pruned daily |
| Reports | 2 years |
| Audit | 1 year |
| Job history | 30 days |
| Access logs | 30 days |

Deleting a hosted project deletes (or archives) the Forgejo repository after the grace period. The
UI requires typing the slug to confirm and offers an export before deletion.

## Consistency rules

1. A version's `design_sha256` is computed over the **committed bytes**, not the parsed document.
2. `projects.updated_at` changes when metadata, visibility or a ready version changes.
3. `projects.status` is derived from the latest version; a trigger or the ingest transaction keeps
   them consistent.
4. `versions.metrics` is written once, in the same transaction as `status = 'ready'`.
5. `artifacts` are written before the version is marked `ready`; a reader never sees a `ready`
   version with missing required artifacts.
6. Counters (`downloads`) are best-effort and incremented outside the read path.
