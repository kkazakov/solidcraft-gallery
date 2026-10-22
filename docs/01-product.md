# 01 — Product

## Problem

SolidCraft saves a design as a single `.solidcraft` file. Sharing one today means attaching it to a
GitHub issue (which refuses the extension), a Discord message, or a cloud folder. There is no place
where a design can be discovered, previewed, searched, versioned and downloaded without an
account — and no lightweight way to keep a project in git while showing it to the world.

The product is that place: **a public gallery with git underneath and a private workspace on top**.

## Users and jobs

| Persona | Job to be done | Success looks like |
|---|---|---|
| **Maker / hobbyist** | "Show my part to the community and let people download it." | Publishes a project in under five minutes; gets a page with renders and files. |
| **Open-hardware maintainer** | "Keep the CAD in my repo, but make it browsable and searchable." | Connects an existing GitHub repo; every tagged release gets a page. |
| **Designer looking for a part** | "Find an enclosure for a Raspberry Pi 4 and check the dimensions." | Searches, filters by tag/license, sees measurements, downloads STEP. |
| **Team member (private)** | "Keep my work-in-progress private but reachable from any machine." | Private project, visible only after sign-in, clonable with a token. |
| **Remixer** | "Start from someone else's design legally." | Sees the license, forks the repo, attribution preserved. |
| **Moderator** | "Remove infringing or abusive content quickly." | Report queue, quarantine, audit trail. |

## User stories and acceptance criteria

### Public visitor

- **US-1** As a visitor I can browse a home page with featured, recent and trending projects.
  - Cards show a rendered thumbnail, title, author, license and tags.
  - The page is server-rendered and usable without JavaScript.
- **US-2** As a visitor I can search by free text and filter by tag, license and "has STEP".
  - Results update with a query parameter; every result is linkable and back-button safe.
  - Zero results shows suggestions (popular tags, clear filters).
- **US-3** As a visitor I can open a project page and see renders, measurements, description,
  versions, license and downloads.
  - Three renders (iso, top, front) with alt text; a placeholder if rendering failed.
  - Volume, bounding box, body count and mass when available.
  - Download `.solidcraft`, STEP and STL; the `.solidcraft` is the exact committed file.
- **US-4** As a visitor I can open the source repository and see the commit/tag for a version.
- **US-5** As a visitor I can report a project without an account (rate-limited, captcha optional).

### Signed-in user

- **US-6** As a user I can sign in with Forgejo (hosted) or GitHub (external repos).
- **US-7** As a user I can create a hosted project and publish a `.solidcraft`.
  - The server strips `cache/*`, commits, tags optionally, and queues a render.
  - The project page is live within 30 seconds, or shows "processing" with a reason.
- **US-8** As a user I can connect an existing public GitHub/GitLab/Gitea repository.
  - The site detects `project.json`, the design path and the license.
  - A push webhook (or a 15-minute poll) updates the page.
- **US-9** As a user I can set a project to public, unlisted or private.
  - Private projects never appear in search, sitemaps, RSS, API listings or shared caches.
- **US-10** As a user I can edit title, description, tags and license from the dashboard; the change
  is committed to the hosted repository (external repos: open a PR later, or edit in git).
- **US-11** As a user I can see why a version failed (render timeout, missing dependency, bad file)
  and retry it.
- **US-12** As a user I can create API tokens with `read` or `write` scope.

### Admin

- **US-13** As an admin I can review reports, quarantine a project and record a reason.
- **US-14** As an admin I can feature a project and see queue, render failure and storage metrics.
- **US-15** As an admin I can suspend a user and revoke their tokens and sessions.

## Scope

### MVP

- Hosted Forgejo repositories, public/unlisted/private projects, direct `.solidcraft` support.
- External public GitHub/GitLab/Gitea/Codeberg repositories (read-only indexing).
- Renders, measurements, search, tags, license filter, versions/tags, downloads, STEP/STL.
- Invite-only accounts, sessions, API tokens, report flow, admin queue, audit log.
- Docker Compose deployment, backups, metrics, structured logs.

### Later (explicitly not MVP)

- Git LFS and object storage for large designs.
- External private repositories and OAuth beyond GitHub.
- Organizations/teams, collaborators, comments, favorites feed, follows.
- Fork/remix button that creates a repository.
- Similar-design search (perceptual hashes), geometric search.
- Email notifications, RSS, ActivityPub federation.
- PDM/CollabCraft integration, in-app publish command, plugin.
- Payment, verified authors, marketplace.

### Non-goals

- A browser-based CAD editor or a viewer that runs the engine in the visitor's browser.
- Live multi-user editing.
- A general-purpose git forge (Forgejo already is one).
- Hosting arbitrary files or formats unrelated to SolidCraft.
- Mobile-native applications.

## Success metrics

| Metric | Beta target |
|---|---|
| Time from publish to public page | p95 < 30 s |
| Render success rate | > 98% of versions |
| Search zero-result rate for non-empty queries | < 15% |
| Weekly active authors | 20 |
| Public projects with a license | 100% |
| Takedown response | < 24 h |
| Storage per public project (median) | < 15 MB |

## Terminology

- **Project** — the site entity: metadata + a repository + a primary design.
- **Repository** — the git source of truth; hosted (Forgejo) or external.
- **Design** — a `.solidcraft` file; the primary one is declared in `project.json`.
- **Version** — a commit that contains a design; **release** — a version pointed at by a git tag.
- **Publish** — create a commit/release that the site indexes. Not every `Ctrl+S`.
- **Lean** — a container with `cache/*` removed.
- **Artifact** — a derived file: thumbnail, render, Open Graph image, STEP, STL.
- **Owner** — the user who connected or created the repository.

## Product principles

1. **The repository is the database.** Anything the site knows should be recoverable from git.
2. **Direct format support.** No conversion the user has to understand.
3. **Public means public; private means invisible.** No accidental indexing, ever.
4. **A failed render is not a failed publish.** Show the design; mark the preview as pending.
5. **Small surface, sharp edges documented.** The sandbox and the token model are part of the product.
6. **Attribution and license are first-class.** They are shown, filtered and preserved on forks.
