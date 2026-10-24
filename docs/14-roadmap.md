# 14 — Roadmap

## Assumptions

- One full-stack developer, full time; part-time design and operations review.
- SolidCraft desktop and `solidcraft-cli` are available and stable enough to track automatically.
- Designs are under 5 MB; no LFS, no object storage, no live editing.
- The beta is invite-only and English-only.

Estimates are in working weeks and assume no major upstream change. The critical path is
**Forgejo OAuth + repository creation → publish → ingest → render**; everything else can slip
without blocking the public read experience.

## Timeline

| Milestone | Weeks | Theme | Exit criterion |
|---|---|---|---|
| M0 | 1 | Foundations | CI green, Compose up, fixtures and `craftpub` working |
| M1 | 2–3 | Identity, hosted repos, publish | A fixture published to a public page in < 30 s |
| M2 | 4–5 | Public site and search | Anonymous browse/search/download is usable |
| M3 | 6–7 | Dashboard and external repos | A GitHub push updates a page |
| M4 | 8 | Admin, moderation, quotas | Report → quarantine → audit works |
| M5 | 9 | Hardening and operations | Restore drill and load targets met |
| M6 | 10 | Beta launch | Launch checklist complete |

Buffer: one week inside M5. A two-week slip is absorbed by launching with hosted repositories only
and deferring external GitHub (M3) — the public read path does not depend on it.

## M0 — Foundations (week 1)

**Goal:** a running skeleton and the contracts that everything else builds on.

Tasks:

- Repository: `apps/web`, `apps/worker`, `packages/*`, `infra/`, `fixtures/`, `docs/`.
- Tooling: TypeScript strict, ESLint, Prettier, Vitest, Playwright, `svelte-check`.
- CI: lint, typecheck, unit, build, Docker build, secret scan.
- Compose: Caddy, web, worker, Postgres, Forgejo (dev), Mailpit.
- Database: first migration from [appendix/schema.sql](appendix/schema.sql); seed script.
- `project.json` schema in code and [appendix/project.schema.json](appendix/project.schema.json).
- `craftpub` v0: `lean`, `validate`, `render` (local), `publish` placeholder.
- Fixtures: the 14 files in [13 — Testing](13-testing.md#fixtures), with `manifest.json`.
- ADRs recorded in [00 — Decisions](00-decisions.md) (already written).

Acceptance:

- `docker compose up` serves a placeholder page and `/healthz`.
- Migrations apply to an empty database and are idempotent.
- `craftpub validate fixtures/box.solidcraft` exits 0; corrupt fixtures exit non-zero with codes.
- CI is green on the initial commit.

## M1 — Identity, hosted repositories, publish (weeks 2–3)

**Goal:** the thinnest end-to-end path from sign-in to a public page.

Tasks:

- Forgejo OAuth2: login, callback, state/PKCE, session, logout; invite gate.
- Users, identities, sessions, API tokens; `authorizeProject` skeleton.
- Forgejo provisioning: OAuth app, repo creation, scoped token storage, webhook creation.
- `POST /projects` (hosted), `POST /projects/:id/publish` with multipart and idempotency.
- Lean strip in memory (ZIP rewrite or CLI re-save), size/format validation.
- Commit + push helper in the worker; tag support; conflict detection (`409`).
- Job queue: schema, claim/lease/retry, `repo.sync`, `version.ingest`, `version.render`.
- Ingest: fetch, hash, detect, parse metadata, validate, version row.
- Render: sandbox v1 (`nsjail`), snapshot ×3, `eval`, artifacts, status.
- Minimal pages: `/login`, `/dashboard` (list only), `/{owner}/{slug}` (raw data, no polish).
- Forgejo `pre-receive` lean hook (can land late in the milestone).

Acceptance:

- Sign in with a seeded Forgejo user; create a project; upload `bracket.solidcraft`.
- The commit contains no `cache/*`; the repo is private by default.
- Within 30 s the public page shows three images and metrics (or a visible processing state).
- Killing the worker mid-job requeues it and the version becomes ready.
- A corrupt fixture fails with `design_unreadable` and the page remains a 404/private placeholder.

## M2 — Public site and search (weeks 4–5)

**Goal:** a site worth sharing.

Tasks:

- Home (featured/recent/tags), search page with filters and cursor, tag pages, profile pages.
- Project page: gallery, measurements, downloads, README, versions, source link, report dialog.
- Media route: public artifacts, content-addressed caching, WebP variants, `nosniff`.
- Search: trigger, weights, fallback, facets, suggestions, `public_projects` view.
- SEO: titles, meta, canonical, OG images, sitemap, robots, JSON-LD.
- Static pages: about, terms, privacy, DMCA.
- Empty/error/processing states; skeletons; mobile layout; accessibility pass.
- Caddy: TLS, compression, security headers, body limits, cache rules.

Acceptance:

- An anonymous visitor can browse, search by title/tag/parameter name, open a project, download
  `.solidcraft`/STEP/STL, and report it.
- Lighthouse mobile: performance ≥ 90, accessibility ≥ 95 on home and project pages.
- `sitemap.xml` contains only public ready projects; a private project is absent from search, tags,
  sitemap and suggestions (tested).
- Search p95 < 500 ms on the seeded corpus.

## M3 — Dashboard and external repositories (weeks 6–7)

**Goal:** the product is usable by authors who already have a repo.

Tasks:

- Dashboard: projects and repos tables, status, errors, retry, sync now.
- Project settings: metadata, tags, license, visibility transitions, danger zone, export.
- New project: upload tab and connect tab with detection preview.
- External GitHub public repos: connect, tree scan, raw fetch, webhook, polling fallback.
- GitLab/Gitea/Codeberg: same adapter interface, at least one beyond GitHub.
- Releases: tags, version page, latest vs historical, changelog link.
- Derivatives: STEP/STL on publish, hidden when unavailable.
- Favorites (bookmark) and download counters — small, optional.
- API tokens UI and `Authorization: Bearer` on the public API.

Acceptance:

- Connect `github.com/<fixture>/pi-case`; the detected title/design/license are correct.
- A push (mocked webhook) changes the page within 30 s; a poll catches a missed webhook.
- Visibility changes propagate: public → unlisted (`noindex`) → private (404 for others).
- Publish conflict returns a clear 409 and the UI explains how to resolve it.

## M4 — Admin, moderation, quotas (week 8)

**Goal:** operate it without trusting everyone.

Tasks:

- Admin: stats, queue, reports, feature/quarantine, users, invites, audit viewer.
- Report flow end-to-end (anonymous allowed, rate-limited, deduplicated).
- Quotas and rate limits: per-user projects, publishes, connects, reports; per-repo size.
- Kill switches: `PUBLISH_DISABLED`, `WORKER_PAUSED`, project quarantine.
- Account deletion and data export.
- Terms/DMCA workflow; security contact; `security.txt`.

Acceptance:

- A reported project can be quarantined in under a minute; the public gets 404; the audit row
  records the actor, reason and time.
- Suspending a user revokes sessions/tokens and hides their projects.
- Limits are enforced with stable error codes and `Retry-After`.
- An invite can be created, used once, and revoked.

## M5 — Hardening and operations (week 9)

**Goal:** survive contact with the internet.

Tasks:

- Sandbox review: seccomp, rlimits, no-network, output validation; escape test.
- SSRF review and egress firewall; provider allowlist.
- CSP/nonce, sanitizer corpus, CSRF tests, signed-URL tests.
- Backup automation and a full restore drill; document RTO/RPO.
- Monitoring, alerts, dashboards, status page, request ids, log redaction.
- Load test: browse/search/download/publish; fix the top three bottlenecks.
- Runbooks (R1–R7) rehearsed by someone who did not write them.
- Dependency audit, image scan, CLI release checksum and canary.

Acceptance:

- Restore from backup into a scratch environment in < 4 h, verified by a project render.
- Load targets in [13 — Testing](13-testing.md#load-tests) met on production-sized hardware.
- No open high/critical security findings; medium findings have an owner and a date.
- A malicious fixture cannot open a socket, read `/etc/passwd`, or exceed memory.

## M6 — Beta launch (week 10)

**Goal:** invite 20 authors and learn.

Tasks:

- Seed 10–15 quality projects (with permission) across categories.
- Onboarding email/page: save lean, push, tag, connect.
- Docs: author guide, troubleshooting, API reference, `project.json`.
- Status page, analytics (cookie-less), feedback form.
- Launch checklist ([15 — Risks](15-risks.md#launch-checklist)) signed off.
- Support rotation and a triage board.

Acceptance:

- 20 invited authors; 10 published projects; < 5% render failures.
- Median publish-to-page < 30 s; zero private leaks in an access review.
- A new author can publish without talking to the team.

## Post-MVP backlog (ordered)

1. **Git LFS / object storage** — only if files exceed 25 MB regularly.
2. **Private external repositories** — GitHub OAuth `repo`, token custody, UI.
3. **Organizations and collaborators** — owners, teams, per-project roles.
4. **Fork/remix button** — create a repo from a tag, preserve license and attribution.
5. **Comments, follows, favorites feed** — community, with moderation cost.
6. **Similar designs** — perceptual hash of renders; no ML infrastructure.
7. **RSS/email notifications** — release feed, new-project digest.
8. **PDM/CollabCraft integration** — private team workspaces, live collaboration.
9. **In-app “Publish”** — a SolidCraft command/plugin once the plugin host supports network + UI.
10. **Localization** — UI strings, then metadata language detection.

## Effort breakdown (person-weeks)

| Area | Weeks |
|---|---|
| Foundations, CI, Compose | 1.0 |
| Auth, users, invites | 1.0 |
| Forgejo integration, publish, lean | 1.5 |
| Pipeline, sandbox, render | 1.5 |
| Public pages, search, SEO | 2.0 |
| Dashboard, external repos | 1.5 |
| Admin, moderation | 0.75 |
| Hardening, ops, load | 1.0 |
| Launch, docs, seed | 0.75 |
| **Total** | **10.0** |

Confidence: medium. The two unknowns are Forgejo OAuth/provisioning quirks and sandbox behavior on
the chosen host; both are de-risked in M0–M1.

## Dependencies and critical path

```text
M0 ─► Forgejo OAuth spike ─► M1 publish ─► M1 render ─► M2 pages/search
                                   │
                                   └─► M3 external repos ─► M4 admin ─► M5 hardening ─► M6
```

- If Forgejo OAuth blocks, fall back to a service account that creates repositories on behalf of
  users; the public product is unaffected.
- If the sandbox is unstable on the host, run the worker on a separate small VM before launch.
- If external GitHub slips, launch hosted-only; the roadmap absorbs it.
