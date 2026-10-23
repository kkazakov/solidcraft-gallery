# 00 — Decision log

Each decision is recorded with its context, the choice, the consequences, and the alternatives
that were rejected. New decisions append; existing ones are superseded, never rewritten.

---

## D0 — This is a standalone service, not a SolidCraft plugin

**Context.** SolidCraft's plugin design ([#1221]) is an in-document WebAssembly component: it
exports `manifest`/`execute` (and later `evaluate`), imports `run(command, args)`, has no
open/save hooks, no background execution and no per-plugin UI in milestone 2. Network access is
still undecided and the host itself is not shipped. Accounts, repository storage, sharing links,
search and a browser UI cannot live inside that boundary.

**Decision.** Build a separate web service that consumes `.solidcraft` files and the pinned
`solidcraft-cli`, with its own identity, database, git integration and UI. An in-app “Publish”
command can later be a thin client to this service, when the plugin host supports network and UI.

**Consequences.** The product works today without waiting for #1221. It is a service to operate:
domain, auth, moderation, backups. The plugin ecosystem, when it lands, is a distribution channel,
not the foundation.

**Rejected.** Waiting for the plugin host; a plugin-only product (cannot host accounts, sync or
panels); embedding a web view in the desktop app (out of scope, platform work).

[#1221]: https://github.com/tangency-labs/solidcraft/issues/1221

---

## D1 — `.solidcraft` is stored directly in git

**Context.** A `.solidcraft` is a ZIP container (`container.json`, `document.json`,
`blobs/<sha256>.<ext>`, optional `cache/*`). The earlier idea of a parallel "unpacked" layout
optimised git storage but required a conversion step and a second representation.

**Decision.** The repository stores the container exactly as the app saves it. The site may unpack
it in memory or in its own cache, but the user-visible artifact is always the `.solidcraft` file.

**Consequences.** Direct support, no pack/unpack tool required, the download is the exact file the
app opens. Repository growth depends on the optional model cache and on how often large imports
change; both are controlled by D2.

**Rejected.** Unpacked `document.json` + `blobs/` as the only repo format (worse UX, custom
tooling); a new "git-friendly" `.solidcraft` variant (format churn, no app support).

---

## D2 — Lean commits, 25 MB cap, no LFS in the MVP

**Context.** `file.save` defaults to `cache: true`, embedding `cache/model.json` and
`cache/bodies.bin` (the evaluated model) plus a 240×150 `cache/thumbnail.png`. The cache changes on
every geometry edit and delta-compresses poorly. It can be most of a small file.

**Decision.** Strip every `cache/*` entry before a commit that the service creates. Reject or warn
on oversized cached containers. Cap a design file at 25 MB and a repository at 1 GB. Do not
introduce Git LFS in the MVP.

**Consequences.** A parametric edit is a few-KB delta. Designs with heavy, frequently changing
STEP imports will hit the cap; those projects move to the **later** LFS path or object storage.
The embedded thumbnail is lost, so the site renders its own.

**Rejected.** LFS by default (client install, linear storage, pointer resolution complexity);
storing zips with the cache (every save is a multi-MB blob); auto-squashing history (loses
provenance).

---

## D3 — Forgejo is the hosted git backend

**Context.** The "hosted repository" option needs users, authentication, HTTP/SSH git, webhooks,
repository browsing, quotas and an API. Writing that is months of security-sensitive work.

**Decision.** Run Forgejo and treat it as infrastructure. The site is an OAuth2 client and uses
Forgejo's API for repository creation, collaborators and webhooks. Git writes go directly to
Forgejo with the user's token; the site never proxies git traffic.

**Consequences.** Two identity surfaces (site session and Forgejo account) that must share one
identity provider. Forgejo upgrades become part of operations. In exchange, repository browsing,
issues, pull requests and LFS (later) come for free.

**Rejected.** Gitea (viable, but Forgejo is the community-maintained fork and the ecosystem's
direction); GitHub as the hosted backend (no control over quotas, rate limits, or data);
bare repos + libgit2 (auth, hooks, LFS, web UI are the hard parts).

---

## D4 — External repositories are read-only for the site

**Context.** "Own repository" means GitHub, GitLab, Gitea, Forgejo or Codeberg. Writing to a user's
repository requires broad OAuth scopes and creates a second write path with different permissions.

**Decision.** The site only reads external repositories. It fetches the design at a commit through
the provider API or a shallow, sandboxed clone, and indexes it. Publishing happens in the user's
own git client or CI. The site may open a pull request **later**, never push to the default branch.

**Consequences.** Smaller blast radius and simpler token custody. The user must push before the
site sees a change. Webhooks are optional; polling is the fallback.

**Rejected.** Push-to-external on "Publish" (scope creep, token risk); mirroring the repository
into Forgejo (confusing duplication).

---

## D5 — SvelteKit and TypeScript, PostgreSQL, Postgres-backed jobs

**Context.** The application is CRUD, SSR, auth and a job dashboard; the heavy CAD work happens in
the Rust CLI. A compiled backend would duplicate the ecosystem but not reuse its engine.

**Decision.** SvelteKit 2 (Node adapter) with TypeScript for the web and worker; PostgreSQL 16 for
data, full-text search and the job queue; no Redis in the MVP. Pin Node 22 LTS.

**Consequences.** One language for web and worker, fast iteration, simple hiring. The render
worker is a thin process supervisor around `solidcraft-cli`. PostgreSQL carries search and queue
load; at the first scaling wall, add Meilisearch and a dedicated queue, in that order.

**Rejected.** Rust/axum for the site (slower UI work, no reuse of the engine in the web tier);
Next.js (viable, but SvelteKit's server routes and smaller runtime fit the SSR-only design);
Redis/BullMQ (another service to operate for a queue that fits in Postgres).

---

## D6 — One instance, one database, one artifact volume

**Context.** The beta target is hundreds of projects, tens of thousands of page views per month,
and a single maintainer.

**Decision.** Deploy a single Docker Compose stack on one VPS: Caddy, web, worker, Forgejo,
PostgreSQL, artifact volume. S3-compatible storage is an interface option, not a requirement.

**Consequences.** Easy backup and restore, low cost, one failure domain. Horizontal scaling is
documented but deliberately postponed: make web stateless, keep artifacts on shared storage, and
move the worker out first.

**Rejected.** Kubernetes (operational overhead for one service); serverless renders (cold starts,
binary size, sandboxing); managed git (cost, lock-in).

---

## D7 — CPU rendering with `solidcraft-cli snapshot`

**Context.** The CLI renders headlessly with a GPU when available and a CPU rasterizer otherwise.
Thumbnails are small and latency-tolerant.

**Decision.** Render on CPU in the worker, asynchronously, with a 60-second budget. No GPU host.
Three views (`iso`, `top`, `front`) at 1200×900, plus a 1200×630 Open Graph image. Derivatives
(STEP, STL) are exported in the same job.

**Consequences.** Renders cost CPU seconds; a queue and a per-file cache are mandatory. Large
assemblies may time out; that is a visible, non-fatal state, not a publish failure.

**Rejected.** GPU workers (cost, availability, driver work); client-side rendering in visitors'
browsers (no trust, no SEO, no Open Graph).

---

## D8 — Commit-based publishing, no live co-editing, no merge

**Context.** SolidCraft has no document-level merge ([#626] is an open proposal). Two editors on
the same branch produce conflicting binaries.

**Decision.** Each publish is a commit. The site shows commits and tags, but never merges. A
non-fast-forward publish is rejected with "pull first"; the hosted UI may offer "save as a new
branch" **later**. Private projects are single-owner in the MVP.

**Consequences.** Predictable history and no data loss. Teams that need concurrent editing wait
for the upstream PDM/CollabCraft tracks.

**Rejected.** Last-writer-wins force pushes (silent data loss); CRDT/OT (out of scope, requires
document-model changes upstream).

[#626]: https://github.com/tangency-labs/solidcraft/issues/626

---

## D9 — Invite-only beta, public read

**Context.** Public CAD uploads bring spam, malware-in-STEP, license violations and takedown
obligations. Moderation capacity is the constraint, not storage.

**Decision.** Anonymous visitors can browse, search and download. Creating projects requires an
invite or an allowlisted account during the beta. Public projects require an SPDX license and a
passing render. A report button and an admin queue exist from day one.

**Consequences.** A controlled launch with a manageable abuse surface. Open registration is a
product decision after the beta, not an engineering blocker.

**Rejected.** Fully open registration at launch (unmoderated public binaries); login-required
browsing (kills discovery and SEO).

---

## D10 — Public projects require an SPDX license

**Context.** A public gallery distributes CAD files. Without a license, downstream use is legally
ambiguous and remixing is impossible.

**Decision.** `project.json.license` is required for public visibility and must be an SPDX
identifier. The repository must contain the corresponding `LICENSE` file. Private and unlisted
projects may omit it.

**Consequences.** A small friction at publish time; a clear community norm; the site can display
and filter by license.

**Rejected.** Free-text licenses (unparseable); no license requirement (legal ambiguity).

---

## D11 — The site never renders user HTML

**Context.** Project descriptions and READMEs are Markdown from an untrusted repository.

**Decision.** Parse Markdown server-side, sanitize to a strict allowlist (no raw HTML, no scripts,
no event handlers, no `javascript:` URLs), and render it as HTML with a CSP nonce. Images in
READMEs are proxied or limited to HTTPS.

**Consequences.** XSS through a README is prevented; some authoring conveniences are lost.

**Rejected.** Client-side Markdown rendering with a sanitizer as the only defense; raw HTML.

---

## D12 — The worker is a separate process from the web tier

**Context.** Rendering untrusted CAD files is the highest-risk operation in the system.

**Decision.** The worker runs in its own container with the CLI, no database superuser, no
outbound network for render jobs, and a sandbox (`nsjail` or `bubblewrap`) per invocation. The web
tier never spawns the CLI.

**Consequences.** A render compromise does not expose sessions or tokens directly. The worker
still needs database and artifact access; those credentials are scoped and rotated.

**Rejected.** In-process rendering in the web tier (blast radius); a hosted rendering API
(privacy, cost, file size).

---

## D13 — Open registration on the drun.net deployment

**Context.** The first public deployment is on `solidcraft.drun.net` / `forgejo.drun.net`. The
operator has asked for open Forgejo self-registration and no gallery invite gate, superseding the
invite-only beta policy in D9 for this deployment.

**Decision.** Set `FORGEJO_DISABLE_REGISTRATION=false` and `INVITE_REQUIRED=0` on the drun.net
deployment. Any Forgejo identity can create a gallery account. Invite support stays in the code and
`.env.example` keeps the closed defaults (`true`/`1`) for other deployments.

**Consequences.** Registration is open to anyone who can create a Forgejo account, so moderation,
quotas and abuse handling become the constraint. Closing the beta again is a configuration change,
not a code change. D9 remains the safe default outside this deployment.

**Rejected.** Keeping the invite gate on drun.net (the operator explicitly removed it); removing
invite support from the code (it is still needed for controlled deployments).

---

## D14 — Invite-gated beta returns to drun.net, with a visible code field

**Context.** The operator asked for beta invitations on `solidcraft.drun.net` again and for the
invite code field that the sign-in page used to have. D13 had opened the deployment and D9's gate was
unused; the operator has now re-enabled it and wants the code to be enterable, not only link-driven.

**Decision.** Set `INVITE_REQUIRED=1` on the drun.net deployment while keeping Forgejo
self-registration open (`FORGEJO_DISABLE_REGISTRATION=false`) so an invitee can create the provider
account the gallery login needs. The sign-in page renders an invite code field whenever the gate is
on; it is a plain `GET` form, so it works with `csr = false`, and it forwards the code as `?invite=`
into the provider start URL. Invite links prefill the same field. Invites stay CLI-only
(`pnpm invites`, wrapped by `scripts/new-invite.sh`).

**Consequences.** Every new gallery identity needs a valid code unless it is in `ADMIN_USERNAMES`;
existing identities are unaffected. Forgejo accounts remain open to create, so the gallery gate — not
Forgejo — is the beta boundary. Closing provider sign-up too is a one-variable change.

**Rejected.** Link-only invites (the operator asked for the field); adding a separate invite-redeem
endpoint (the OAuth transaction already carries the hashed code); closing Forgejo self-registration
(invitees would need hand-made provider accounts).

---

## D15 — Close Forgejo sign-up; the operator provisions provider accounts

**Context.** D14 restored the gallery invite gate but left Forgejo self-registration open, so anyone
could still create a provider account — and use Forgejo itself — without an invite. The operator asked
to close sign-up as well.

**Decision.** Set `FORGEJO_DISABLE_REGISTRATION=true` on the drun.net deployment. Every Forgejo
account is created by the operator (Forgejo admin UI or `forgejo admin user create`) and paired with a
gallery invite code. The sign-in page hides the "Create a Forgejo account" link and states that an
operator-created account is required; the invite code field and `?invite=` links remain the
self-service step.

**Consequences.** There is no self-registration anywhere: onboarding is manual, and a Forgejo account
alone is not enough to enter the gallery. Reopening provider sign-up is a one-variable change and does
not affect the gallery gate. The invite field is now the only thing an invitee can do alone.

**Rejected.** Keeping Forgejo sign-up open (the operator asked to close it); removing the invite field
(it is the only self-service step left); adding an invite-driven Forgejo sign-up (no such feature in
Forgejo 9).

---

## D16 — Invite holders create their own Forgejo account from the gallery

**Context.** D15 closed Forgejo sign-up, which left the operator hand-creating every provider account.
An invite should be enough: the gallery already holds `FORGEJO_ADMIN_TOKEN` for hosted-repository
provisioning, and the invite gate already decides who may join.

**Decision.** Add `/auth/register?invite=<code>`. With a valid code the page collects a username, an
optional email and a password; the web tier creates the Forgejo account through the admin API
(`POST /api/v1/admin/users`, `must_change_password=false`, `send_notify=false`), then consumes one
invite use and inserts the gallery user plus its `forgejo` identity (keyed on the Forgejo numeric id)
in the same transaction. The invitee is redirected to `/auth/login?registered=1` and signs in with the
new credentials; the OAuth callback finds the identity, so the code is not needed twice. Forgejo
self-registration stays closed. Invalid, revoked, expired or exhausted codes are rejected before
anything is created, and a failed gallery insert deletes the just-created provider account. A blank
email becomes `${username}@${BETA_EMAIL_DOMAIN:-users.solidcraft.drun.net}`.

**Consequences.** One invite yields exactly one provider account and one gallery account, and onboarding
is self-service. Because the admin token can create arbitrary Forgejo users, the route validates the
invite, checks uniqueness and rate-limits per address. Passwords are chosen by the invitee and stored
only by Forgejo. Usernames are first-come within a code's remaining uses.

**Rejected.** Keeping manual `forgejo admin user create` (the operator asked for self-service); enabling
Forgejo's own sign-up (it has no invite gate); creating the gallery rows only on the OAuth round trip
(the invite would already be spent).

---

## D17 — Web admin dashboard for users and beta invites

**Context.** Invites were CLI-only (D14) and admins had no browser view of accounts or codes. The
operator asked for an admin dashboard with a right-hand menu, a paginated users list, paginated beta
codes with deletion, and one-time code creation.

**Decision.** Add an admin-only `/admin` area linked from the top navigation after Forgejo.
`/admin/users` lists accounts with role, sign-in providers, project count, join time, last-seen time
and suspension. `/admin/invites` lists codes with note, uses, expiry, creator and state; it creates
codes with uses and expiry days and hard-deletes rows after a confirmation step. A signed-in
non-admin gets `404`; the subtree is `no-store`/`noindex`, and form posts are origin-checked. The raw
code is returned only in the create POST response and is never stored or listed again. This
supersedes D14's "Invites stay CLI-only" clause; the CLI remains supported and keeps revoke
semantics.

**Consequences.** Operators can run the beta without shell access. Raw codes are not recoverable from
the database or the list. Hard delete removes the invite row and its note; accounts that accepted it
are unaffected. Audit entries are still not written.

**Rejected.** Read-only lists (the operator asked for delete and create); soft-revoke only in the UI
(the operator asked for delete); storing raw codes (hashes remain the only stored form).
