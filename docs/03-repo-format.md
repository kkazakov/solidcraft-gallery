# 03 — Repository format

This is the contract between a project repository and the site. It is intentionally small: a
manifest, a design file, a README and a license, all in git.

## What a `.solidcraft` is

Two representations are valid, and the reader distinguishes them by content, not by extension:

| Form | Bytes start with | Contents |
|---|---|---|
| **Container (default on Save)** | `PK\x03\x04` | `container.json`, `document.json`, `blobs/<sha256>.<step\|mesh\|png\|jpeg>`, optional `cache/model.json`, `cache/bodies.bin`, `cache/thumbnail.png` (240×150), optional `cache/preview.*` |
| **JSON (export/legacy)** | `{` | Pretty-printed document; binary payloads inline as base64 |

Upstream limits: 256 MiB per design, 10,000 entries, 512 MiB expanded. Nothing in this plan may
exceed those; the site's own cap is stricter (25 MB).

The site never requires a conversion. It serves the committed bytes and opens them in the CLI.

## Layout

```text
project.json                     # optional but recommended
designs/<name>.solidcraft        # primary design, or a single *.solidcraft anywhere
README.md                        # optional; rendered on the project page
LICENSE                          # required for public projects
.gitattributes                   # recommended: *.solidcraft -text
renders/                         # optional; author-supplied images, never required
```

Rules:

- Exactly one **primary** design. It is `project.json.design` when present; otherwise the only
  `*.solidcraft` in the repository (root or `designs/`). Zero or more than one is an error.
- Paths are relative, use `/`, contain no `..`, and stay inside the repository.
- Additional `.solidcraft` files are listed as downloadable files but do not create pages.
- The default branch is the latest version. Tags are releases.
- A repository may be a monorepo of several projects **later**; v1 indexes one project per repo.
- Reserved owner names: `u`, `t`, `admin`, `api`, `media`, `dashboard`, `login`, `auth`, `search`,
  `webhooks`, `sitemap.xml`, `robots.txt`. They collide with application routes.

## `project.json`

Minimal:

```json
{
  "schema": 1,
  "title": "Raspberry Pi 4 case",
  "license": "CC-BY-4.0",
  "design": "designs/case.solidcraft"
}
```

Full:

```json
{
  "schema": 1,
  "title": "Raspberry Pi 4 case",
  "description": "Snap-fit enclosure with M2.5 standoffs, port cut-outs and a vent field.",
  "tags": ["enclosure", "raspberry-pi", "snap-fit", "petg"],
  "license": "CC-BY-4.0",
  "design": "designs/case.solidcraft",
  "cover": "renders/iso.png",
  "authors": [{ "name": "Jane Doe", "url": "https://example.com/jane" }],
  "links": {
    "website": "https://example.com/pi-case",
    "video": "https://example.com/pi-case.mp4"
  },
  "solidcraft": ">=0.18"
}
```

| Field | Type | Required | Rules |
|---|---|---|---|
| `schema` | integer | yes | `1` |
| `title` | string | yes | 1–120 chars, no control characters |
| `description` | string | no | ≤ 2,000 chars; plain text or Markdown |
| `tags` | string[] | no | ≤ 10; each 1–32 chars; `[a-z0-9-]`; unique |
| `license` | string | public only | SPDX identifier; repository must contain the license text |
| `design` | string | recommended | relative path to the primary `.solidcraft` |
| `cover` | string | no | relative path to a PNG/JPEG/WebP; used as a fallback image |
| `authors` | object[] | no | each `{name, url?}`; defaults to the repository owner |
| `links` | object | no | keys `website`, `video`, `docs`, `printables`, `thingiverse`; HTTPS URLs only |
| `solidcraft` | string | no | minimum app version; informational in v1 |

The JSON Schema is [appendix/project.schema.json](appendix/project.schema.json).

### Fallbacks when `project.json` is absent

| Field | Fallback |
|---|---|
| `title` | Repository name, humanised (`pi-case` → “Pi Case”) |
| `description` | First paragraph of `README.md`, truncated to 300 chars |
| `tags` | Provider topics (GitHub/GitLab) if available, else empty |
| `license` | Detected from `LICENSE`/`COPYING` (SPDX scan); `NOASSERTION` if unknown |
| `design` | The only `*.solidcraft` file in the repository |
| `authors` | Repository owner |

Public visibility still requires a resolved license; a `NOASSERTION` project is created as
**unlisted** and the owner is asked to add one.

## Lean commits

The container's optional `cache/*` entries are the only part that grows badly:

- `cache/model.json` + `cache/bodies.bin` contain the evaluated model; they change on every
  geometry edit and compress poorly.
- `cache/thumbnail.png` is small but tied to the same document hash.

**Policy:** the committed `.solidcraft` should contain no `cache/*` entries. The local working file
may keep them.

```sh
# simplest, format-level, no rebuild; cache is optional to the reader
cp case.solidcraft case.lean.solidcraft
zip -d case.lean.solidcraft 'cache/*'

# canonical, via the app (opens and re-saves without the cache)
cat > lean.json <<'EOF'
{"commands":[{"command":"file.save_as","params":{"path":"case.lean.solidcraft","cache":false}}]}
EOF
solidcraft-cli run lean.json --in case.solidcraft
```

Enforcement:

| Where | Behaviour |
|---|---|
| Hosted publish (site) | Server strips `cache/*` before committing; the user cannot upload a cached file |
| Hosted direct push | `pre-receive` hook: if a `*.solidcraft` is > 10 MB **and** contains `cache/`, reject with the `zip -d` hint |
| External repo | Advisory: the dashboard shows “cache included (12.4 MB)” and links to this section |
| Download | Serves committed bytes; an optional “lean download” re-packs without the cache |

Why this is enough for small designs: the container writer uses fixed ZIP timestamps and stable
entry order, and blobs are content-addressed. An unchanged design saved twice is typically
byte-identical; a parametric edit changes `document.json` (kilobytes) and leaves the blobs intact,
so git stores a small delta. The model cache breaks that property; lean commits restore it.

## Visibility

| Site visibility | Hosted repository | External repository | Where it appears |
|---|---|---|---|
| `public` | Public | Public | Search, tags, home, sitemap, API |
| `unlisted` | Public | Public | Direct link only; not in search/sitemap/home |
| `private` | Private | Private (later) | Owner dashboard only; signed artifacts |

Rules:

- Creating a `private` hosted project creates a private Forgejo repository.
- `private` external repositories are **later**; connecting one in the MVP is refused with a clear
  message.
- Changing `public` → `private` makes the hosted repo private in the same transaction (best effort;
  the UI reports a partial failure).
- Search, sitemap and RSS queries always filter `visibility = 'public' AND status = 'ready'`.
- Public visibility may be chosen while the first version is still rendering. The project, its page
  and its media stay hidden until that version is `ready`; the owner can see the pending state in
  the dashboard.
- A site project cannot be more permissive than its repository: a public page requires a
  public repository. The reverse is fine (a public repository can back an unlisted page).

## Versions and releases

- Every commit that changes the primary design is a **version**; the site indexes the latest one on
  the default branch.
- A **tag** on a commit marks a release. The site lists releases first, then history.
- The owner can pin a ready version as **active**. The public page and all downloads use the active
  version; a newly rendered version becomes active automatically. Projects without an explicit
  active version fall back to the newest ready one.
- Recommended tag format: `vMAJOR.MINOR.PATCH` (e.g. `v1.2.0`); free-form tags are accepted but
  sorted lexicographically after semver.
- The site never rewrites tags. A moved tag is re-indexed and shown with its new commit.
- A publish without a tag is valid; the project page shows “Latest (unreleased)”.

## Limits and quotas

| Limit | Value | Enforced |
|---|---|---|
| Design file | 25 MB | Publish validation, webhook ingest |
| Files per repository | 10 designs, 1,000 total entries | Ingest |
| Repository size | 1 GB (soft) | Periodic check; warn at 800 MB |
| Projects per user | 25 (beta) | Create |
| Project tags (manifest) | 10 | Schema and ingest |
| Release tags (git) per project | 20 | Ingest (first 20 kept) |
| Title / description / tags | as in the schema | Validation |
| Render time | 60 s | Sandbox |
| Repository creation rate | 5/hour, 20/day | Rate limit |

Exceeding a hard limit fails the version with a human-readable reason on the dashboard; it never
publishes a partial page.

## Linked components and assemblies

SolidCraft components reference other designs by local path. A repository that links to a file
outside itself is not portable: another machine, or the renderer, cannot resolve it.

- During ingest the worker opens the design and inspects linked components.
- If every dependency is inside the repository, it proceeds.
- If a dependency is missing or external, the version is marked `ready` with a **warning**
  (“3 linked components are outside this repository”) and previews may be incomplete. Public
  projects with unresolved dependencies are **not** promoted to featured.
- A repository should contain the dependency closure, typically:

```text
designs/assembly.solidcraft
designs/parts/bracket.solidcraft
designs/parts/plate.solidcraft
```

- The site does not rewrite links.

## `.gitattributes`

```gitattributes
*.solidcraft -text
```

`-text` marks the file binary: no EOL conversion, no line-based diff, no merge attempts. For JSON
`.solidcraft` files an author may opt into `diff` with a custom driver; not required.

## Author workflows

### Desktop app (GUI)

1. Save the design normally (cache included is fine locally).
2. Run `craftpub lean designs/case.solidcraft` (or the zip command) before committing.
3. `git add`, `git commit`, `git push`; tag for a release.
4. The site indexes the push automatically (hosted) or via webhook/poll (external).

### CLI / CI

`--out` is for geometry export (STEP/3MF/STL), not for saving a design. Use an explicit
`file.save_as` script:

```sh
cat > lean.json <<'EOF'
{"commands":[{"command":"file.save_as","params":{"path":"case.lean.solidcraft","format":"container","cache":false}}]}
EOF
solidcraft-cli run lean.json --in case.solidcraft
```

`craftpub lean` wraps this and verifies the result opens.

### Web upload (hosted, no git client)

The dashboard accepts a `.solidcraft` up to 25 MB, strips the cache server-side, creates the
repository if needed, and commits with a generated message. The user still gets a real git remote
they can clone later.

## Validation summary

A repository is accepted when:

1. `project.json` parses (or fallbacks resolve), and fields validate.
2. The primary design exists, is ≤ 25 MB, and parses as a container or JSON document.
3. Public projects have an SPDX license and a `LICENSE` file.
4. Tags, title and description pass the length/charset rules.
5. The repository is reachable and the commit exists.
6. No path escapes the repository.

Rejections return a stable machine code plus a human message; the dashboard shows both. See
[05 — API](05-api.md) for codes.
