# 05 — API

Base URL: `https://gallery.example/api/v1`. JSON only (`application/json`; uploads use
`multipart/form-data`). The API is versioned by path; breaking changes create `/api/v2`.

## Authentication

| Caller | Mechanism |
|---|---|
| Browser (site) | `__Host-gallery_session` cookie, `HttpOnly`, `Secure`, `SameSite=Lax` |
| CLI / integrations | `Authorization: Bearer gallery_pat_…` |
| Webhooks | Provider signature (HMAC) or a per-repo secret header |
| Public reads | none |

A bearer token is hashed (SHA-256) and looked up; scopes are `read` and `write`. `write` implies
`read`. Admin endpoints also require `users.role = 'admin'`.

CSRF: state-changing browser requests require either a same-origin `Origin` header or a
double-submit token (`X-CSRF-Token` matching the `gallery_csrf` cookie). Bearer requests are exempt.

## Conventions

- **Errors** use one envelope:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "design is larger than 25 MB",
    "details": { "field": "design", "limit_bytes": 26214400 }
  }
}
```

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `validation_failed` | malformed body or field |
| 401 | `unauthorized` | missing or expired credentials |
| 403 | `forbidden` | authenticated but not allowed |
| 404 | `not_found` | unknown or invisible resource |
| 409 | `conflict` | slug taken, stale parent, duplicate |
| 413 | `payload_too_large` | over the configured limit |
| 415 | `unsupported_media_type` | not a design/JSON |
| 422 | `unprocessable_design` | parsed but invalid/incomplete |
| 429 | `rate_limited` | with `Retry-After` |
| 503 | `upstream_unavailable` | Forgejo/provider/DB temporarily unavailable |

- **Pagination**: cursor-based. `?limit=24&cursor=…`. Response:

```json
{ "items": [ … ], "next_cursor": "eyJpZCI6…", "total_estimate": 128 }
```

Cursors are opaque base64url of `(sort_value, id)`. `limit` 1–100, default 24. Stable ordering:
`published_at desc, id desc` for browse; `rank desc, id desc` for search.

- **Idempotency**: `Idempotency-Key` (UUID) required on `POST /projects/:id/publish`; stored 24 h
  and replayed with the original response.
- **Rate limits** (per IP and per user, sliding window):

| Endpoint group | Anonymous | Authenticated |
|---|---|---|
| Reads | 120/min | 600/min |
| Search | 30/min | 120/min |
| Publish | — | 10/hour |
| Repo connect | — | 5/hour |
| Reports | 5/day | 20/day |
| Token create | — | 10/day |

`429` includes `Retry-After`; `X-RateLimit-*` headers are advisory.

- **Caching**: public project payloads return `ETag` and `Cache-Control: public, max-age=60,
  stale-while-revalidate=300`; private responses `Cache-Control: private, no-store`.

## Endpoints

### Public

#### `GET /search`

| Query | Type | Notes |
|---|---|---|
| `q` | string | ≤ 200 chars; FTS + trigram fallback |
| `tag` | string[] | repeatable; AND semantics |
| `license` | string | SPDX id |
| `has` | `step\|stl` | derivative availability |
| `sort` | `relevance\|newest\|popular` | default `relevance` when `q`, else `newest` |
| `limit`, `cursor` | | |

```json
{
  "items": [
    {
      "id": "0b0e…",
      "slug": "pi-case",
      "owner": { "username": "jane", "display_name": "Jane Doe" },
      "title": "Raspberry Pi 4 case",
      "description": "Snap-fit enclosure…",
      "tags": ["enclosure", "raspberry-pi"],
      "license": "CC-BY-4.0",
      "thumbnail_url": "/media/9f2c…/thumb.webp",
      "metrics": { "bodies": 3, "bbox_mm": [120, 80, 32] },
      "published_at": "2026-10-20T12:00:00Z"
    }
  ],
  "next_cursor": null,
  "total_estimate": 1
}
```

Only `visibility = 'public' AND status = 'ready'` are returned.

#### `GET /projects/:owner/:slug`

Returns the project, its latest ready version, releases and available artifacts.

```json
{
  "id": "0b0e…",
  "slug": "pi-case",
  "owner": { "username": "jane", "display_name": "Jane Doe", "avatar_url": "…" },
  "title": "Raspberry Pi 4 case",
  "description": "…",
  "readme_html": "<p>…</p>",
  "license": "CC-BY-4.0",
  "tags": ["enclosure", "raspberry-pi"],
  "visibility": "public",
  "status": "ready",
  "repository": {
    "provider": "forgejo",
    "url": "https://git.gallery.example/jane/pi-case",
    "default_branch": "main"
  },
  "latest": {
    "commit": "a1b2c3…",
    "tag": "v1.2.0",
    "authored_at": "2026-10-20T12:00:00Z",
    "metrics": { "bodies": 3, "volume_mm3": 41234.5, "bbox_mm": [120, 80, 32.5] },
    "artifacts": {
      "iso": "/media/9f2c…/iso.webp",
      "top": "/media/9f2c…/top.webp",
      "front": "/media/9f2c…/front.webp",
      "og": "/media/9f2c…/og.png"
    }
  },
  "releases": [
    { "tag": "v1.2.0", "commit": "a1b2c3…", "authored_at": "2026-10-20T12:00:00Z" }
  ],
  "downloads": {
    "solidcraft": "/jane/pi-case/download?version=v1.2.0&format=solidcraft",
    "step": "/jane/pi-case/download?version=v1.2.0&format=step",
    "stl": "/jane/pi-case/download?version=v1.2.0&format=stl"
  },
  "warnings": []
}
```

A `private` project returns `404` to anyone but the owner and admins.

#### `GET /projects/:owner/:slug/versions`

Cursor-paginated commits, newest first, with tag/status/metrics. `?include=failed` is owner-only.

#### `GET /projects/:owner/:slug/download`

Query: `version` (tag or SHA, default latest release, then HEAD), `format`
(`solidcraft|step|stl`).

- Public: streams the artifact/committed bytes with `Content-Disposition: attachment`.
- Private: 302 to a signed URL valid 5 minutes, or streams if authenticated.
- Increments `downloads` asynchronously (never blocks the response).
- `404` if the version or format does not exist; `403` if private.

#### `GET /users/:username`

Public profile: display name, avatar, public project count, projects (cursor-paginated).

#### `GET /tags`

Popular tags with counts. Cached 5 minutes.

#### `GET /meta`

Instance stats: public projects, authors, last index time. Cached.

### Authentication

#### `GET /auth/login?provider=forgejo&redirect=/dashboard`

302 to the provider with PKCE and `state` bound to a short-lived cookie. Only `forgejo` and
`github` in the MVP.

#### `GET /auth/callback/:provider`

Validates `state`, exchanges the code, links or creates the user, creates a session, redirects to a
safe relative path (open-redirect check). Errors render a page with a retry link.

#### `POST /auth/logout`

Revokes the session and clears the cookie. CSRF-protected.

### Current user

#### `GET /me`

```json
{
  "id": "…",
  "username": "jane",
  "display_name": "Jane Doe",
  "role": "user",
  "identities": [{ "provider": "forgejo", "username": "jane" }],
  "limits": { "projects": 25, "design_bytes": 26214400 }
}
```

#### `PATCH /me`

`display_name`, `email` (if the provider does not own it), `avatar_url` (https only). Username
changes are **later** (they break URLs).

### Tokens

- `GET /tokens` — prefix, name, scopes, last used, expiry.
- `POST /tokens` `{name, scopes, expires_in_days?}` — returns the raw token **once**.
- `DELETE /tokens/:id` — revoke.

### Projects (authenticated)

#### `POST /projects`

Two modes, discriminated by `mode`.

**Hosted** (`mode = "hosted"`):

```json
{ "mode": "hosted", "title": "Pi case", "slug": "pi-case", "visibility": "private" }
```

Creates a private Forgejo repository and a `private` project, and returns `201` with the clone URL
and an empty-state publish URL. `public` is chosen after the first ready version and requires a
license; that transition also makes the repository public.

**External** (`mode = "external"`):

```json
{ "mode": "external", "url": "https://github.com/jane/pi-case" }
```

Validates the URL (HTTPS, allowed host), detects the provider, fetches `project.json` + the design
at HEAD, and creates the project in `pending`. Public repositories need no token. Private
repositories and GitLab OAuth are **later** (public GitLab reads are supported).

Errors: `409` slug taken, `422` no design found, `403` repository private without permission.

#### `PATCH /projects/:id`

Owner only. `title`, `description`, `tags`, `license`, `visibility`, `slug`. For hosted projects the
change is committed back to the repository (`project.json` and/or README) in the same operation;
if the commit fails the DB change is rolled back. For external projects metadata is site-only in
the MVP (a note explains that git remains authoritative and a later sync may overwrite).

Visibility transitions:

- `public` requires a ready version and a resolved license.
- `→ private` updates the hosted repository to private before the DB commit.
- `→ unlisted` keeps the repository public and adds the site-only hide flag.

#### `POST /projects/:id/publish`

Multipart: `design` (file ≤ 25 MB), optional `tag`, optional `message`. Idempotency key required.
Flow: validate → strip `cache/*` → commit to Forgejo → insert `version(pending)` → enqueue
`version.ingest`.

```json
{ "version_id": "…", "commit": "a1b2…", "status": "pending", "status_url": "/api/v1/versions/…" }
```

`202 Accepted`. `409` if the branch moved since the client's last known commit (body includes the
current SHA; the client pulls and retries).

#### `GET /projects/:id/status`

Owner-only. Returns project status, latest version status, last error, queue position (best
effort).

#### `DELETE /projects/:id`

Owner or admin. Requires `?confirm=<slug>`. Soft-deletes, disables the repository (hosted) or
disconnects (external), schedules artifact GC after 30 days.

#### `POST /projects/:id/retry`

Owner-only. Re-enqueues the latest failed version (`409` if it is not failed).

### Repositories

- `POST /repos` `{url, token?}` — connect an external repository; validates access, stores the

**Implementation status:** connect is `POST /api/v1/repos` and owner sync is
`POST /api/v1/projects/:id/sync`. Webhook-secret rotation, `/repos/:id/sync` and disconnect are not
implemented yet.
  token encrypted, sets a webhook secret. Returns the repo and detected project.
- `POST /repos/:id/sync` — enqueue `repo.sync` for HEAD; rate limit 10/hour.
- `POST /repos/:id/webhook` — regenerate the webhook secret (owner only).
- `DELETE /repos/:id` — disconnect; project becomes read-only (`status = error` with a notice) for
  30 days before deletion.

### Admin

| Endpoint | Purpose |
|---|---|
| `GET /admin/reports?status=open` | Queue |
| `PATCH /admin/reports/:id` | `actioned`/`dismissed`, note |
| `PATCH /admin/projects/:id` | `featured`, `quarantined` |
| `PATCH /admin/users/:id` | `role`, `suspended` |
| `GET /admin/stats` | Queue depth, render failures, storage, DAU |
| `POST /admin/reindex` | Full search reindex (job) |

Every admin mutation writes `audit_log`.

### Webhooks (not under `/api/v1`)

| Endpoint | Verification |
|---|---|
| `POST /webhooks/forgejo` | `X-Forgejo-Signature` HMAC-SHA256 with the repo secret |
| `POST /webhooks/github` | `X-Hub-Signature-256` |
| `POST /webhooks/gitlab` | `X-Gitlab-Token` (constant-time compare) |
| `POST /webhooks/gitea` | `X-Gitea-Signature` |

Rules: body ≤ 1 MB, respond `202` after enqueueing, never do work inline, ignore ping events,
deduplicate by `(repo, after, ref)`, verify the repository is connected, and never trust the
payload's repository URL (resolve by id).

## Media

`GET /media/:sha/:name` serves public artifacts. The path is content-addressed; unknown hashes
`404`. Public responses are `Cache-Control: public, max-age=31536000, immutable` and
`X-Content-Type-Options: nosniff`. `Content-Type` is derived from the artifact kind, never from the
URL or user input.

Private artifacts are **not** served here; they use signed URLs:

```text
GET /media/private/:artifactId?exp=…&sig=…
```

HMAC-SHA256 over `artifactId|exp|userId`, 5-minute TTL, constant-time compare, no caching.

## OpenAPI

The implementation ships an OpenAPI 3.1 document generated from the route schemas at
`/api/v1/openapi.json`, with a rendered reference in the docs. It is part of the definition of done
for each milestone.
