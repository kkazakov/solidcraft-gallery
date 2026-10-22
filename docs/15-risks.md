# 15 — Risks, open questions, launch checklist

## Risk register

Likelihood/impact: L/M/H. Score is the product; anything ≥ 12 needs an owner and a dated mitigation.

| ID | Risk | L | I | Score | Mitigation | Trigger |
|---|---|---|---|---|---|---|
| R1 | Parser or sandbox escape from a malicious `.solidcraft` | M | H | 12 | `nsjail`, no network, rlimits, output validation, dedicated worker, patched host, fuzz corpus | Any sandbox test failure or upstream CVE |
| R2 | SSRF through a user-supplied repository URL | M | H | 12 | HTTPS-only, resolve+block private ranges, no redirects, allowlist, egress firewall | A blocked address in logs |
| R3 | Forgejo OAuth/provisioning does not support the per-user flow | M | M | 9 | M0 spike; service-account fallback; collaborators | Spike fails in week 1 |
| R4 | Renders time out or cost too much | M | M | 9 | CPU cache by design hash, 60 s cap, queue, placeholder, smaller views on retry | Failure rate > 5% |
| R5 | Scope creep (orgs, live editing, comments) | H | M | 12 | Non-goals in [01](01-product.md); roadmap gate; “later” list | A milestone slips by a week |
| R6 | Moderation and legal burden (infringement, unsafe content) | M | H | 12 | Invite-only beta, report/takedown, terms, DMCA, audit, quarantine | First credible complaint |
| R7 | Search quality is poor; gallery feels empty | M | M | 9 | Keywords from documents, tags guidance, zero-result review, seed content | Zero-result rate > 15% |
| R8 | Repository bloat from cached containers | L | M | 6 | Lean policy, hook, 25 MB cap, monitor repo sizes | Repo > 800 MB |
| R9 | Single-maintainer burnout / key person | M | H | 12 | Documented runbooks, one-click deploy, backups, narrow scope | Two consecutive missed weeks |
| R10 | CLI output/format changes break ingest | M | M | 9 | Pin version, contract tests, golden images, staged upgrades | New CLI release |
| R11 | Private project leaks through a query or cache | L | H | 12 | `public_projects` view, central authz, tests, signed private media | Any 200 for a non-owner |
| R12 | Provider API changes or rate limits | M | M | 9 | Adapter boundary, backoff, polling fallback, recorded fixtures | 429/410 spike |
| R13 | Spam, malware, or illegal content in public projects | M | H | 12 | Invite gate, report queue, quarantine, license requirement, download warning | First report |
| R14 | Backup is untested and fails during an incident | M | H | 12 | Monthly restore drill, offsite encrypted copies, RTO measured | Drill fails |
| R15 | Launch traffic exceeds the single VPS | L | M | 6 | Static caching, CDN for media, queue, documented scale-out | p95 > 1 s or 503s |
| R16 | OAuth token theft from the database | L | H | 12 | AES-256-GCM, key separate from DB, rotation, least scopes, audit | Suspicious repo activity |
| R17 | Git hook or submodule execution in the worker | L | H | 12 | `core.hooksPath=/dev/null`, no submodules, no LFS smudge, sandbox | Any fetch script change |
| R18 | Designers do not adopt git workflows | M | M | 9 | Web upload path, `craftpub`, clear docs, “download repo” | < 30% hosted uploads |

## Open questions

| # | Question | Default if undecided | Owner |
|---|---|---|---|
| Q1 | Product name and domain | “SolidCraft Gallery” / `gallery.example` | product |
| Q2 | TypeScript/SvelteKit vs Rust/axum | TypeScript (D5) | tech lead |
| Q3 | Beta length and invite policy | 3 months, invite-only | product |
| Q4 | Require a license for unlisted projects too? | No, public only | legal/product |
| Q5 | Allow anonymous downloads of public designs? | Yes | product |
| Q6 | Enable GitHub OAuth at launch or hosted-only? | Hosted-only if M3 slips | product |
| Q7 | Comments at launch? | No, post-MVP | product |
| Q8 | Self-host Forgejo on the same VPS or separate? | Same VPS for beta | ops |
| Q9 | Who is on moderation duty? | Founder + one volunteer | ops |
| Q10 | Data residency / region | EU (GDPR) | legal |
| Q11 | Email provider | None at launch; add for notifications | ops |
| Q12 | Do we need a status page at launch? | Yes, static external | ops |

## Spikes to run before committing

1. **Forgejo OAuth + repo creation + push** (2 days): one script that signs in, creates a repo,
   commits a design, tags it, and receives a webhook.
2. **Sandbox** (2 days): `nsjail` on the target host, render a fixture with no network, verify
   rlimits and output validation.
3. **Render determinism** (1 day): same design, three runs, pHash distance; confirm golden-image
   viability.
4. **Lean rewrite** (1 day): `zip -d` and the CLI re-save produce files the app opens; compare
   hashes and sizes.
5. **FTS ranking** (1 day): seed 50 projects, measure relevance for 20 queries, tune weights.

Each spike ends with a one-page note appended to the relevant document.

## Launch checklist

### Product and content

- [ ] 10–15 seeded public projects with licenses, READMEs and renders.
- [ ] Home, search, project, profile, about, terms, privacy, DMCA pages reviewed.
- [ ] Author guide: lean save, commit, tag, connect, visibility.
- [ ] `project.json` documentation and examples.
- [ ] Empty states and error copy reviewed on mobile.

### Security

- [ ] Authorization matrix tests pass for every route.
- [ ] SSRF suite passes; egress firewall blocks metadata and RFC1918.
- [ ] Sandbox escape test fails as expected; no network in render jobs.
- [ ] CSP, HSTS, nosniff, frame-ancestors verified on staging.
- [ ] Secret scan clean; tokens encrypted; signed URLs expire.
- [ ] Dependency audit: no high/critical; image scan clean.
- [ ] `security.txt` and a security contact published.

### Operations

- [ ] Backups running; restore drill completed and timed.
- [ ] Alerts: availability, queue, render failures, disk, certificate, backup age.
- [ ] Status page live; incident runbook rehearsed.
- [ ] Kill switches tested (`PUBLISH_DISABLED`, `WORKER_PAUSED`).
- [ ] Log redaction verified (no tokens, no cookies).
- [ ] Rollback tested with the previous image.

### Legal and policy

- [ ] Terms of service, privacy policy, DMCA process, content policy.
- [ ] License requirement enforced for public projects.
- [ ] Data deletion and export paths tested.
- [ ] Moderation queue staffed; response SLA published.

### Launch

- [ ] Invites sent to 20 authors.
- [ ] Monitoring watched for 24 h by a human.
- [ ] Feedback form linked from the footer.
- [ ] Post-launch review scheduled at one week.

## Success metrics (90 days)

| Metric | Target |
|---|---|
| Public projects | 100 |
| Authors who published ≥ 2 projects | 20 |
| Weekly searches | 500 |
| Median publish-to-page | < 30 s |
| Render success | > 98% |
| Takedown response | < 24 h |
| Private-project leak incidents | 0 |
| Uptime | 99.5% |

## Decision review

Revisit after the beta:

- Whether to open registration.
- Whether LFS/large files are demanded by real usage.
- Whether organizations/teams are the next product step.
- Whether to integrate with PDM/CollabCraft rather than build more storage.
- Whether the site should become a SolidCraft upstream project or stay independent.
