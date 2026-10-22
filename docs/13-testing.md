# 13 — Testing

The system's risk is concentrated in three places: parsing untrusted CAD files, authorization, and
the pipeline's asynchronous state. Tests are weighted accordingly.

## Test pyramid

| Layer | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | validators, slugs, cursors, ACL function, Markdown sanitizer, URL/SSRF checks, manifest fallbacks | every commit |
| Integration | Vitest + Postgres + Forgejo (container) | migrations, ingest, render (fixture CLI), search, webhooks, signed URLs, jobs | every PR |
| End-to-end | Playwright | public browse/search/download, sign-in, create, publish, visibility, admin | every PR (preview), nightly |
| Contract | Vitest + pinned CLI | `snapshot`, `eval`, `run --out`, exit codes, output formats | every PR |
| Load | k6 | browse/search/publish/download | weekly, before release |
| Security | Vitest + Playwright + ZAP | authz matrix, SSRF, XSS, CSRF, zip bombs, sandbox | every PR + weekly |

No test requires network access except the pinned provider mocks; Forgejo and GitHub/GitLab are
stubbed at the HTTP boundary with recorded fixtures.

## Fixtures

`fixtures/` contains real files, committed with expected metadata:

| Fixture | Purpose |
|---|---|
| `box.solidcraft` | minimal solid, one body, no parameters |
| `bracket.solidcraft` | sketch + extrude + fillet, parameters |
| `assembly.solidcraft` + parts | linked components inside the repo |
| `assembly-external.solidcraft` | link outside the repo (warning path) |
| `import-step.solidcraft` | STEP import, larger blob |
| `sketch-only.solidcraft` | no bodies (placeholder image path) |
| `json-design.solidcraft` | pretty JSON form, no container |
| `cached.solidcraft` | model cache included (lean detection) |
| `corrupt.solidcraft` | truncated ZIP |
| `zip-bomb.solidcraft` | 10k entries / expanded bomb |
| `traversal.solidcraft` | `../` entry names |
| `huge-title.json` | manifest validation |
| `no-license.json` | public without license |
| `unicode-title.solidcraft` | i18n, slug generation |

Expectations live in `fixtures/manifest.json`: SHA-256, size, expected title, body count, render
success, error code. The CLI version is recorded; updating the CLI requires re-recording.

## Unit tests

- `project.schema.json` validation: every field, boundary, unknown key rejection.
- Slug generation: unicode, collisions, reserved names, max length.
- Visibility transitions: public without license refused, private repo + public project refused.
- Authorization matrix: table-driven for (anonymous, owner, other, admin) × (view, edit, publish,
  delete, token, admin).
- Cursor encode/decode: tamper, wrong sort, expired.
- Markdown sanitizer: script tags, event handlers, `javascript:` URLs, `<img>`, `<svg>`, entities,
  very deep nesting.
- URL safety: loopback, RFC1918, IPv6, metadata IP, credentials in URL, non-HTTPS, redirects.
- Token hashing and prefix display.
- Error mapping: every pipeline code has a stable message.

## Integration tests

Each test gets a transaction or a schema-isolated database; migrations run once per suite.

1. **Migrations**: apply from empty; snapshot schema; apply twice (idempotent); no destructive diff
   in CI.
2. **Ingest**: each fixture through `version.ingest`, asserting version status, metadata, warnings
   and stored bytes.
3. **Render**: with a fake CLI (shell script) for speed, and a nightly run with the real pinned CLI;
   assert artifacts, metrics, placeholder and failure codes.
4. **Jobs**: claim with `SKIP LOCKED`, lease expiry, retry/backoff, dead-letter, duplicate delivery.
5. **Webhooks**: valid/invalid HMAC, replayed delivery, unknown repo, oversized body, ping.
6. **Search**: trigger updates, ranking order for a known corpus, tag/license filters, cursor
   pagination, private exclusion, trigram fallback.
7. **Auth**: OAuth state/PKCE, open redirect, session rotation, token scopes, revocation.
8. **Signed URLs**: valid, expired, tampered artifact id, cross-user.
9. **Storage**: local driver write/read/delete, dedupe by hash, path traversal attempts.

## End-to-end scenarios

- Anonymous: home → search → filter → project → download → report.
- Sign in with Forgejo → create hosted project → publish a fixture → see processing → ready → make
  public → appears in search.
- Connect a public GitHub fixture repo → webhook push → page updates.
- Private project: direct URL 404 for another user; owner sees it; search excludes it; sitemap
  excludes it.
- Unlisted: link works, `noindex`, no search.
- Publish conflict: second publish with a stale base gets a clear 409.
- Admin: report → quarantine → 404 for public → audit entry.
- Render failure: fixture fails, page still readable, owner sees the error and Retry.
- Token: create, use with curl, revoke, 401 after.

Playwright runs against a preview deployment with seeded data. Screenshots are compared for the
three core pages at two viewports (360×800, 1440×900) with a small pixel threshold; layout changes
require an intentional baseline update.

## Golden images

Renders are deterministic for a fixed CLI, view and size.

- Compare with perceptual hash (pHash) or SSIM ≥ 0.98, not byte equality.
- Store baselines per fixture per view in `fixtures/golden/`.
- A diff produces an artifact (actual, expected, diff) in CI for review.
- Updating the CLI requires regenerating baselines in a dedicated commit with the version bump.

## Load tests

| Scenario | Target |
|---|---|
| Browse home + project | 100 req/s, p95 < 300 ms |
| Search | 30 req/s, p95 < 500 ms |
| Download (100 MB egress) | 20 req/s, no error |
| Publish | 10 concurrent, p95 < 30 s to public page |
| Worker throughput | 60 renders/hour on 2 vCPU |

k6 scripts live in `tests/load/`. Results are recorded per release; a regression > 30% blocks the
release.

## Security tests

- **Authorization matrix** automated over the route table; a new route without a policy fails.
- **SSRF suite** with a mock resolver: public host, loopback, private, IPv6, redirect, slowloris.
- **XSS corpus** in title, description, README, tag, filename; assert sanitized output and CSP.
- **CSRF**: cross-origin POST without token → 403.
- **Upload**: truncated ZIP, bomb, traversal, wrong magic, 25 MB + 1 byte.
- **Sandbox**: a test binary that opens a socket or reads `/etc/passwd` must fail.
- **Dependency**: `npm audit --production`, lockfile check, secret scan (gitleaks), SBOM.
- **ZAP baseline** against staging weekly; findings triaged.

## CI pipeline

```text
lint (eslint, prettier, svelte-check)
typecheck
unit
integration (postgres service, forgejo service)
contract (pinned CLI)
build (web, worker)
e2e (preview container)
docker build + scan (trivy)
migration diff check
secret scan
```

Rules:

- `main` is protected; one approval; all checks green.
- Coverage target: 80% on `packages/core`, `packages/git`, `packages/render`; no target on UI
  components, Playwright covers them.
- Flaky tests are quarantined within 24 hours and fixed or deleted; never retried silently.
- Nightly: real-CLI render suite, load, ZAP, dependency audit.

## Definition of done for a feature

1. Spec section updated (this plan).
2. Migration + typed query.
3. Route with authorization and validation.
4. Unit + integration tests; e2e if user-visible.
5. Error states and copy.
6. Accessibility check (keyboard, labels).
7. Metrics/logs where the feature has operational risk.
8. Docs: README or plan cross-link.
