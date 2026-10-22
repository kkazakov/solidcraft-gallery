# 07 — Git integration

Two modes, one interface: a project always points at a repository and a commit. The difference is
who can write and where the webhook comes from.

| | Hosted (Forgejo) | External (GitHub / GitLab / Gitea / Codeberg) |
|---|---|---|
| Created by | Site API | User pastes a URL |
| Auth to read | Service account or user token | Public: none; private: user token (**later**) |
| Auth to write | User's Forgejo OAuth token | User's own git client |
| Webhook | Forgejo, per repo, HMAC | Provider webhook, per repo, secret |
| Site pushes | Yes (publish, metadata) | Never |
| Deletion | Archive/delete repo after grace | Disconnect only |

## Hosted: Forgejo

### Deployment

- Hostname `git.gallery.example`, own TLS certificate, SSH on port 2222 (optional; HTTPS git is
  enough for the MVP).
- Database: Forgejo uses the same PostgreSQL instance, separate database and role.
- `app.ini` essentials:
  - `[server] ROOT_URL = https://git.gallery.example/`, `SSH_DOMAIN`, `HTTP_PORT = 3000`
  - `[service] DISABLE_REGISTRATION = true` (accounts are created by the site or by invite)
  - `[oauth2] ENABLED = true`
  - `[repository] DEFAULT_BRANCH = main`, `MAX_SIZE` aligned with the 1 GB quota
  - `[webhook] ALLOWED_HOSTS = gallery.example` (only the site receives hooks)
  - `[security] INSTALL_LOCK = true`, `COOKIE_SECURE = true`
  - `[log] LEVEL = Info`
- The site registers one OAuth2 application: redirect
  `https://gallery.example/auth/callback/forgejo`. Request identity scopes for login and the
  repository scope needed to create and push; confirm the exact scope names in the M0 spike
  (Forgejo has changed them across releases).
- Forgejo is not exposed as a general-purpose public forge in the beta: registration is disabled,
  and only site-created accounts exist.

### Accounts

The site is the front door. On first sign-in:

1. Exchange the OAuth code; read `/api/v1/user`.
2. Create or link a `users` row and an `identities` row.
3. Ensure a Forgejo account exists (OAuth auto-registration when enabled, otherwise the site
   provisions it with a scoped admin token).
4. Store the access token encrypted (`identities.access_token_enc`) for repository creation and
   pushes attributed to the user.

If the provider does not return a reusable token, the site falls back to a **service account** that
is added as a collaborator on each created repository. The fallback is recorded in `identities` and
is visible to the user as “managed by the gallery”.

### Creating a project

```text
POST /api/v1/user/repos
{
  "name": "pi-case",
  "description": "…",
  "private": true,
  "auto_init": true,
  "default_branch": "main",
  "gitignores": "",
  "license": ""
}
```

Then the first publish writes:

```text
project.json
designs/<slug>.solidcraft
README.md
LICENSE            (when the author provides one)
.gitattributes
```

Two implementation options for the multi-file commit:

1. **API per file** — simple, but three or four commits and no atomicity. Acceptable for the first
   publish, not for updates.
2. **Local commit + push** — the worker clones with a scoped token into a temp directory, writes
   files, commits, pushes, optionally tags. Atomic, one commit, easy to sign. **Chosen.**

The token lives only in the process environment for the duration of the job, is never written to
disk, and is scrubbed from logs. Git is invoked with `GIT_TERMINAL_PROMPT=0`,
`GIT_ASKPASS=/bin/true`, a per-job `HOME`, and `-c core.hooksPath=/dev/null`.

Commit identity: `Gallery <gallery@git.gallery.example>` unless the user's identity is available;
the commit message is the user's message or `Publish <title> <version>`.

Authenticate git with a `GIT_ASKPASS` helper that reads a dedicated environment variable; never put
the token in the clone URL or the command line (both are visible in the process list). The worker
scrubs that variable before invoking `solidcraft-cli`, so a render job cannot read it.

### Publish conflict

A publish includes the `base_commit` the client last saw. The worker:

- fetches the branch;
- if `base_commit` is not an ancestor of the remote head, rejects with `409` and the current SHA;
- otherwise commits on top and pushes with `--force-with-lease` **never** (plain push).

The dashboard shows “The project changed on another device. Pull or re-open before publishing.”

### Lean enforcement hook

A global `pre-receive` hook (Forgejo `custom/hooks/pre-receive.d/`) rejects a push when a
`*.solidcraft` at the pushed tip is larger than 10 MB **and** contains `cache/` entries:

```sh
#!/bin/sh
# stdin: <old> <new> <ref>   (Forgejo pre-receive)
set -eu
tmp=$(mktemp)
list=$(mktemp)
trap 'rm -f "$tmp" "$list"' EXIT

while read -r old new ref; do
  case "$new" in
    0000000000000000000000000000000000000000) continue ;;  # branch/tag delete
  esac
  commit=$(git rev-parse --verify "$new^{commit}") || continue

  git ls-tree -r --name-only "$commit" | grep '\.solidcraft$' > "$list" || true
  while IFS= read -r f; do
    size=$(git cat-file -s "$commit:$f" 2>/dev/null || echo 0)
    [ "$size" -gt 10485760 ] || continue
    git cat-file blob "$commit:$f" > "$tmp"
    if unzip -l "$tmp" 2>/dev/null | grep -q ' cache/'; then
      echo "gallery: $f is ${size} bytes and includes cache/*."
      echo "gallery: run 'zip -d $f \"cache/*\"' before committing."
      exit 1
    fi
  done < "$list"
done
exit 0
```

The check is advisory for files under 10 MB (the cache can be small); the site strips it on its own
publishes regardless. The hook is versioned in the infra repository and deployed with Forgejo.

### Webhooks

Forgejo webhook per repository, URL `https://gallery.example/webhooks/forgejo`, secret generated per
repo, events: push, create (tag), repository (visibility change).

Headers: `X-Forgejo-Event`, `X-Forgejo-Delivery`, `X-Forgejo-Signature` (HMAC-SHA256 of the raw
body). Verify before parsing, constant-time, body ≤ 1 MB. Respond `202` after enqueue; a `5xx` makes
Forgejo retry, so only return `5xx` for genuine transient failures.

### Visibility changes

- Site `public` → Forgejo repo public.
- Site `private` → Forgejo repo private **before** the DB commit; if the API call fails, abort and
  keep the old visibility.
- Forgejo-side visibility change (user edits in the forge) → webhook updates `repos.is_private`; if
  a repo becomes private while the site project is public, the site forces the project private and
  notifies the owner.

### Deletion and archival

`DELETE /projects/:id` soft-deletes the project immediately (404 for everyone but the owner/admin,
repo disabled). After 30 days a job deletes the Forgejo repository and all artifacts. The owner can
download a bundle (`.zip` of the repo) before deletion from the dashboard.

## External repositories

### Supported providers (MVP)

| Provider | Hosts | Read | Webhook |
|---|---|---|---|
| GitHub | `github.com` | REST + raw | `X-Hub-Signature-256` |
| GitLab | `gitlab.com` | REST raw | `X-Gitlab-Token` |
| Gitea / Codeberg | `codeberg.org`, self-hosted | REST raw | `X-Gitea-Signature` |
| Generic | any HTTPS git host | shallow clone | polling only |

Private external repositories and GitLab OAuth are **later**; an attempt returns `403` with a
clear message.

**Implementation status:** public GitHub connect, cached-lean-design ingestion and owner-triggered
manual sync are implemented (`POST /api/v1/repos`, `POST /api/v1/projects/:id/sync`). Webhooks,
polling, GitLab and Gitea remain. The connect step runs synchronously and then queues
`version.render`; it does not yet enqueue `repo.sync`.

### Connecting

```text
POST /api/v1/repos { "url": "https://github.com/jane/pi-case" }
```

1. Normalize the URL: HTTPS only, strip `.git`, no credentials, no query, no fragment.
2. Parse `host/owner/repo`; reject unknown hosts unless `ALLOW_ANY_GIT_HOST=true`.
3. Fetch repository metadata and the tree at HEAD.
4. Locate `project.json` or the single `*.solidcraft`.
5. Create `repos` + `projects` (`pending`), enqueue `repo.sync`.
6. Return the detected title/design path so the UI can ask for confirmation.

The site never asks for a GitHub password. Public repositories need no credential. A token, when
provided, is stored encrypted and used only for reads.

### Fetching a file at a commit

Prefer the raw endpoint with the commit SHA, not the branch:

```text
GitHub:  https://raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}
GitLab:  https://gitlab.com/{owner}/{repo}/-/raw/{sha}/{path}
Gitea:   https://{host}/{owner}/{repo}/raw/commit/{sha}/{path}
```

Fallbacks: provider contents API (base64) or a shallow, sandboxed clone:

```sh
git clone --depth 1 --filter=blob:none --no-checkout https://host/owner/repo.git
git -C repo show "$SHA:$PATH"
```

Clones run in the sandbox with no network after the fetch, no hooks, `GIT_TERMINAL_PROMPT=0`, and a
30-second timeout. A repository larger than 1 GB is refused before cloning (metadata check).

### Webhooks

The connect flow registers a webhook when the user grants permission; otherwise the site polls.

| Provider | Event | Verification |
|---|---|---|
| GitHub | `push`, `create` (tag) | HMAC SHA-256 of raw body |
| GitLab | `push`, `tag_push` | `X-Gitlab-Token` equality |
| Gitea | `push`, `create` | HMAC SHA-256 |

Rules: deduplicate by delivery id + `(repo, after)`; ignore deletions and force-push rewrites except
to mark the project stale; never trust payload URLs (resolve by repository id); a webhook for an
unknown repo returns `202` and is dropped.

Polling: `repo.poll` every 15 minutes with ±20% jitter, conditional requests where supported, and a
per-provider rate budget. A manual **Sync now** is available to the owner (10/hour).

### Tokens and scopes

| Provider | Method | Scope |
|---|---|---|
| GitHub | OAuth app or fine-grained PAT | `public_repo` (MVP), `repo` (later) |
| GitLab | PAT (later OAuth) | `read_api`, `read_repository` |
| Gitea/Codeberg | PAT | `read:repository` |

Tokens are encrypted with AES-256-GCM under `TOKEN_ENC_KEY` (key id in the ciphertext), never
logged, never returned by the API, and revoked on disconnect. A `401` from the provider marks the
repo `error` with “reconnect required” and stops polling until the user acts.

## SSRF and URL safety

Any user-supplied URL is hostile. Rules:

1. Scheme must be `https` (no `http`, `git`, `ssh`, `file`).
2. Host must not resolve to loopback, private, link-local, multicast, or cloud metadata addresses
   (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`,
   `100.64/10`). Resolve **and** check every address; connect to the resolved IP, not a second DNS
   lookup.
3. No redirects for API/raw fetches; for clones, `http.followRedirects=false`.
4. Default allowlist: `github.com`, `gitlab.com`, `codeberg.org`, plus configured hosts. Custom
   hosts require an admin flag and still pass checks 1–3.
5. Fetch through the worker's network namespace with egress restrictions where the platform allows
   it; a proxy with a host allowlist is the stronger option for a later hardening pass.
6. Response size caps and timeouts apply before any parser sees bytes.

Residual risk: DNS rebinding and a compromised allowlisted host. Both are documented and mitigated
by egress filtering at the host firewall in production (deny RFC1918 and metadata ranges).

## Quotas and abuse

| Control | Value |
|---|---|
| Repositories per user | 25 (beta) |
| Repository size | 1 GB soft, warn at 800 MB |
| Connect rate | 5/hour |
| Sync now | 10/hour |
| Webhook body | 1 MB |
| Clone timeout | 30 s |
| Failed syncs before pause | 10 consecutive → `error`, owner notified |

Spam prevention: invite-only accounts, a report button, admin quarantine, and a per-user publish
rate limit.

## Failure handling

| Situation | Behaviour |
|---|---|
| Provider 401/403 | repo `error`, “reconnect”, stop polling, notify owner |
| Provider 404 | repo `error`, “repository not found or no access” |
| Provider 429 | honour `Retry-After`, exponential backoff, no user-visible failure until 3 days |
| Force push / rewritten history | keep old versions, mark them “history rewritten”, index the new head |
| Repository renamed | webhook/API resolves by external id; update URL |
| Repository deleted | project `error`, page hidden after grace, owner can export |
| Webhook secret mismatch | `401`, audit, no processing; manual sync available |
| Forgejo down | publish `503`, queue unchanged, retry idempotently |
