# 10 — Frontend

The public site is server-rendered HTML that works without JavaScript. JavaScript enhances search,
uploads and the dashboard; it is never required to read, search or download a design.

## Principles

1. **The design is the hero.** Renders, dimensions and a download button above the fold.
2. **No mystery states.** “Processing”, “render failed” and “private” are visible and explained.
3. **One layout, three audiences.** Public pages, dashboard and admin share the design system.
4. **Fast on a phone.** Budget: < 100 KB HTML, LCP < 2.5 s on 4G, no layout shift.
5. **Accessible by default.** Keyboard, focus, contrast, alt text, reduced motion.

## Routes

```text
(public)
  /                              home
  /search                        search results
  /t/[tag]                       tag landing
  /[owner]/[slug]                project page
  /[owner]/[slug]/versions/[ref] one version
  /u/[username]                  profile
  /about /terms /privacy /dmca   static pages
  /login                         sign-in chooser
  /auth/error                    callback failure

(app)   (requires session)
  /dashboard                     projects + repos overview
  /dashboard/projects/new        hosted upload or external URL
  /dashboard/projects/[id]       metadata, visibility, versions, danger zone
  /dashboard/repos               connected repositories
  /dashboard/tokens              API tokens
  /dashboard/account             identities, sessions, delete account

(admin)
  /admin                         stats + queue
  /admin/reports                 report queue
  /admin/projects                feature/quarantine
  /admin/users                   roles, suspension, invites

(server)
  /media/[...]                   public and signed private artifacts
  /sitemap.xml /sitemap-projects-[n].xml
  /robots.txt
```

Query parameters own filter state (`?q=&tag=&license=&sort=`), so every view is linkable and the
back button works.

## Page specifications

### Home `/`

| Block | Content |
|---|---|
| Header | Wordmark, search, “Sign in” or avatar menu |
| Hero | One sentence, search field, “Publish a design” CTA |
| Featured | 3 projects, admin-selected, with large cards |
| Recent | 12 newest public projects |
| Popular tags | Top 20 tags with counts |
| Footer | About, terms, privacy, source, status |

Empty instance: a single card explaining how to publish the first design.

### Search `/search`

- Search field with debounce (150 ms) and a form fallback.
- Filter row: tags (multi), license (select), “Has STEP”, sort.
- Result count (“About 42 designs”), grid of cards, “Load more” (cursor).
- Zero results: “No designs match. Try fewer filters.” plus popular tags.
- Each card: 4:3 thumbnail, title, owner, tags (max 3), license, dimensions.
- Results are keyboard-navigable; the grid is a list of links, not a JS widget.

### Project `/[owner]/[slug]`

Desktop two-column, mobile stacked:

```text
breadcrumb
title · author · visibility badge · license badge
┌───────────────────────────────┬──────────────────────┐
│  image gallery (iso/top/front)│  Download .solidcraft│
│  thumbnails / arrows          │  STEP · STL          │
│                               │  dimensions, volume  │
│                               │  bodies, mass        │
│                               │  source repository   │
│                               │  tags                │
└───────────────────────────────┴──────────────────────┘
description / README
versions (releases first, then history)
report link · “Open in SolidCraft” help
```

Details:

- Gallery: three renders; if one is missing, show the available ones; if all are missing, a
  neutral placeholder with “Preview unavailable”.
- Measurements displayed with units and rounding: `120 × 80 × 32.5 mm`, `41.2 cm³`, `3 bodies`.
- Download menu: primary `.solidcraft`, secondary STEP/STL; each with size and a short explanation
  (“Open with SolidCraft 0.18 or newer”).
- “Open in SolidCraft” expands to instructions; no custom protocol handler in v1.
- README rendered from sanitized HTML; headings get anchors; code blocks copyable.
- Versions: releases (tags) first with dates; expand for full history; each links to a version page.
- Report: dialog with reason and details; works signed out (rate-limited).
- Unlisted: a small “Unlisted” badge; `noindex`.

### Version page `/[owner]/[slug]/versions/[ref]`

Same layout with that version's artifacts, metrics, commit, tag, date and a download for that
version. A banner when viewing an old release (“This is v1.2.0; the latest is v1.4.1”).

### Profile `/u/[username]`

Avatar, display name, joined date, public project count, grid of public projects. No email, no
private information.

### Dashboard `/dashboard`

- “Your projects” table/cards: title, status, visibility, latest version, updated, actions.
- “Connected repositories”: provider icon, URL, last sync, error state, “Sync now”.
- “Create” split button: upload a design / connect a repository.
- Empty state: two cards with the two paths.

### New project `/dashboard/projects/new`

Two tabs:

1. **Upload** — drag a `.solidcraft` (≤ 25 MB), title, slug, visibility, license; the server strips
   the cache, creates the repo and commits.
2. **Connect repository** — paste an HTTPS URL; preview detected title/design/license; confirm.

Errors are inline and specific (`design_too_large`, `license_required`, `repo_private`).

### Project settings `/dashboard/projects/[id]`

- Metadata form (title, description, tags, license, cover).
- Visibility radio group with consequences spelled out.
- Publish panel: file drop, optional tag, message, progress.
- Versions list with status/error/retry.
- Danger zone: delete (type slug), export repository.

### Admin

- `/admin`: queue depth, renders 24 h, failures by code, storage, recent signups.
- `/admin/reports`: table with reason, project, reporter, age; actions with a required note.
- `/admin/projects`: search, feature toggle, quarantine with reason.
- `/admin/users`: role, suspend, invites.

## Components

| Component | Notes |
|---|---|
| `DesignCard` | Image, title, owner, tags, license; one link |
| `DesignGrid` | Responsive 1/2/3/4 columns; skeletons |
| `Thumb` | `<img>` with width/height, `loading=lazy`, `decoding=async`, WebP + PNG fallback |
| `SearchBar` | Form + optional suggestions; no autofocus on mobile |
| `FilterBar` | Chips with counts; clear-all |
| `TagPill` / `LicenseBadge` / `VisibilityBadge` / `StatusPill` | Small, consistent |
| `ImageGallery` | Keyboard arrows, thumbnails, no lightbox dependency |
| `Measurements` | Unit formatting, tooltips for definitions |
| `DownloadMenu` | Primary/secondary, sizes, disabled reasons |
| `VersionList` | Releases vs history, relative + absolute dates |
| `Readme` | Sanitized HTML, heading anchors |
| `ReportDialog` | Reason select, details, success state |
| `PublishForm` | Drag-drop, progress, error codes |
| `RepoConnectForm` | URL validation, detected metadata preview |
| `TokenList` | One-time secret modal, copy, revoke |
| `EmptyState` / `ErrorState` / `Skeleton` | Shared copy and layout |

No component library with a large runtime; use the app's own tokens and small primitives.

## States

| State | Treatment |
|---|---|
| Loading | Skeleton blocks matching final layout; no spinner-only pages |
| Empty | Explanation + one clear action |
| Processing | Status pill + “previews are being generated”; auto-refresh every 5 s on the dashboard |
| Render failed | Page still readable; placeholder image; owner sees the reason and Retry |
| Private | 404 for others; owner sees a “Private” banner |
| Unlisted | Badge + noindex; no “share” affordance beyond copy link |
| Quarantined | 404 for others; owner sees “Under review” and a contact link |
| Deleted | 410 page with “This project was removed” |

## Accessibility

- Landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, logical heading order.
- Skip link; visible focus rings (2 px, 3:1 contrast).
- All images have alt text: “Isometric render of {title}”.
- Color is never the only status signal; pills include text.
- Forms: label, description, error linked with `aria-describedby`; errors announced in a live region.
- Gallery and menus operable with arrows/Escape; `aria-expanded` on toggles.
- `prefers-reduced-motion` disables transitions.
- Contrast target WCAG AA (4.5:1 text, 3:1 large).
- Tested with keyboard only and one screen reader (NVDA or VoiceOver) per milestone.

## Performance

| Budget | Target |
|---|---|
| HTML | < 100 KB compressed |
| CSS | < 40 KB compressed, one file |
| JS (public pages) | < 30 KB compressed, deferred |
| LCP | < 2.5 s on 4G |
| CLS | < 0.1 |
| Images | WebP, `srcset` 480/960/1200, cached immutable |
| Fonts | System stack for UI; one display face max, subset, `font-display: swap` |

Public pages ship no hydration unless a feature needs it (search suggestions, report dialog).
SvelteKit's `csr = false` for static pages; progressive enhancement for forms.

## Copy and tone

- Short, literal, no marketing superlatives.
- Error codes are paired with a sentence a person can act on.
- “Design”, “project”, “repository” are used consistently with [01 — Product](01-product.md#terminology).
- No exclamation marks in system messages.

## Analytics and privacy

- Self-hosted, cookie-less analytics (Plausible/Umami) or none.
- Events: page view, download, publish, search (query text hashed/aggregated only if needed).
- No third-party scripts, no fonts from CDNs, no tracking pixels.
- README images are **not** loaded from remote hosts in v1; only repo-hosted covers and renders.
- A `/privacy` page states what is stored and for how long.

## Social and sharing

- Open Graph + Twitter card with the `og` artifact.
- “Copy link” on every project; private links are signed and expire.
- No share buttons that embed third-party scripts.

## Error pages

| Code | Page |
|---|---|
| 404 | “Not found” + search |
| 403 | “This link is private or expired” + sign-in |
| 410 | “This project was removed” |
| 429 | “Slow down” with retry time |
| 500 | “Something broke” + status link + request id |
| 503 | “Maintenance” + status link |

The request id is shown for support and logged with the error.

## Theme

The public shell defaults to the operating system colour scheme through `prefers-color-scheme`.
The header selector offers **System**, **Light** and **Dark**; an explicit choice is stored under
`gallery-theme` in `localStorage`. A tiny inline bootstrap in `app.html` applies the stored value to
`<html data-theme="…">` before the stylesheet paints, so there is no flash. Because public pages set
`csr = false`, the switch is framework-free and degrades to System when JavaScript is unavailable.
