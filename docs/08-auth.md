# 08 — Authentication and authorization

There are no passwords. Identity comes from Forgejo (hosted) or GitHub (external repositories).
That removes password storage, reset flows and credential stuffing from the threat model, and it
means the site never sees a git password.

## Identity model

```text
Forgejo account ──OAuth2──┐
                          ├──► users ──► sessions (browser)
GitHub account ───OAuth───┘         └──► api_tokens (CLI)
```

- A user may link both providers; `identities` is unique on `(provider, subject)`.
- The first sign-in creates the user. During the beta, an **invite code** is required unless the
  account is allowlisted.
- Username: the provider handle, normalized to `[a-z0-9-]`, 3–32 chars; collisions get `-2`, `-3`.
  Usernames are permanent in v1 (URLs depend on them).
- Email is stored if the provider returns one; it is never shown publicly and is not a login key.
- Unlinking the last identity is refused (“connect another account first”).
- Account deletion: revoke sessions and tokens, delete hosted repositories, disconnect external
  ones, anonymize the audit actor, delete the user row. A 7-day grace period with a cancel link.

## OAuth flows

### Forgejo (hosted)

1. `GET /auth/login?provider=forgejo&redirect=/dashboard`
2. Generate `state` (32 bytes) and PKCE `verifier`; store both in a signed, `HttpOnly`, 10-minute
   cookie.
3. Redirect to `https://git.gallery.example/login/oauth/authorize?client_id=…&redirect_uri=…&scope=openid+profile+email+repo&state=…&code_challenge=…`.
4. Callback validates `state` (constant-time), exchanges the code at `/login/oauth/access_token`,
   reads `/api/v1/user`.
5. Upsert `users` + `identities`; create a session; redirect to a **relative** path only.

Scopes: `openid profile email repo`. `repo` is required to create repositories and push on the
user's behalf. A user who declines `repo` can still browse but cannot create hosted projects; the
UI explains the limitation instead of failing silently.

### GitHub (external repositories)

Same flow with `https://github.com/login/oauth/authorize`, scopes `read:user user:email public_repo`
(MVP; `repo` only if private external repositories are enabled later). A GitHub identity alone is
enough to browse and connect public repositories; hosted projects still require Forgejo.

### Rules common to both

- `redirect` must be a relative path starting with `/` and not `//`; anything else falls back to
  `/dashboard`.
- `state` and PKCE are mandatory; a missing/mismatched value is a `400`, not a login.
- Callback errors never echo provider error descriptions into HTML.
- Linking a provider to an existing account requires an authenticated session and a fresh
  re-authentication (`max_age` check) — **later**; the MVP creates a separate account per provider
  and offers a “link” action from settings.

### Git over HTTPS

Git's own authentication is HTTP Basic with a login name and an access token (not the account
password), or an SSH key. Forgejo implements it; the site never sees or proxies it. A user cloning
their repository uses the same token mechanism they would with GitHub. The site's OAuth token is a
separate credential, stored encrypted and used only by the server.

## Implementation status

Forgejo and GitHub OAuth sign-in are implemented with a signed, HttpOnly transaction cookie,
mandatory `state` and PKCE S256 (`/auth/login/:provider`, `/auth/callback/:provider`). The callback
upserts `users` + `identities`, creates a normal session and only accepts relative redirect targets.
Access/refresh tokens are **not persisted yet** (token encryption lands with hosted repository
provisioning); the Forgejo `repo` scope is requested so that step can reuse the grant. Linking an
additional provider, unlinking and account deletion remain later work.

## Sessions

| Property | Value |
|---|---|
| Cookie | `__Host-gallery_session` (Secure, Path=/, no Domain, HttpOnly, SameSite=Lax) |
| Value | 32 random bytes, base64url |
| Storage | SHA-256 of the value in `sessions.token_hash` |
| Lifetime | 30 days, sliding, absolute max 90 days |
| Rotation | New value on privilege change (link/unlink, admin promotion) |
| Revocation | Logout, “sign out everywhere”, admin suspension |
| Binding | IP and user agent recorded for display, not enforced (mobile networks) |

The session id is never used as a CSRF token. A session cookie alone never authorizes a
state-changing request from a cross-site context.

## CSRF

- `SameSite=Lax` blocks most cross-site POSTs.
- Every state-changing browser request must also pass an **Origin/Referer** check against the
  configured public origin.
- Forms and `fetch` from the site include `X-CSRF-Token`, compared in constant time with the
  `gallery_csrf` cookie (double submit). The cookie is readable by JS on purpose; it is not a
  credential by itself.
- Bearer-token requests are exempt (no ambient authority).
- `GET` must never mutate state.

## API tokens

```text
gallery_pat_<32 bytes base64url>
```

- Stored as SHA-256; the raw value is shown once.
- `prefix` (first 12 chars) is stored for display and support.
- Scopes: `read`, `write`. `write` implies `read`; admin routes still require `role = admin`.
- Optional expiry; default 90 days for new tokens.
- `last_used_at` updated at most once per minute.
- Revocation is immediate (a `revoked_at` check on every request).
- Tokens are never accepted in query strings or cookies.

## Authorization matrix

| Action | Anonymous | Owner | Admin |
|---|---|---|---|
| View public project | ✅ | ✅ | ✅ |
| View unlisted project by direct link | ✅ | ✅ | ✅ |
| View private project | ❌ | ✅ | ✅ |
| Download public artifact | ✅ | ✅ | ✅ |
| Download private artifact | ❌ | ✅ (signed) | ✅ |
| Search public projects | ✅ | ✅ | ✅ |
| Create project | ❌ | ✅ | ✅ |
| Edit metadata / visibility | ❌ | ✅ | ✅ |
| Publish | ❌ | ✅ | ✅ |
| Delete project | ❌ | ✅ | ✅ |
| Connect external repo | ❌ | ✅ | ✅ |
| Create/revoke own tokens | ❌ | ✅ | ✅ |
| Report a project | ✅ (rate-limited) | ✅ | ✅ |
| Review reports | ❌ | ❌ | ✅ |
| Feature / quarantine | ❌ | ❌ | ✅ |
| Suspend user | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ✅ |

Every handler resolves the project through a single `authorizeProject(user, project, action)`
function. A route that fetches a project by id without calling it fails code review. The function
returns `404` (not `403`) for invisible resources to avoid an existence oracle.

## Visibility rules

- `public`: listed, indexable, cacheable, downloadable.
- `unlisted`: reachable by direct link, `noindex`, excluded from search, sitemap, home, API
  listings and recommendations; still cacheable publicly **only** if the repository is public.
- `private`: owner/admin only; responses `Cache-Control: private, no-store`; artifacts via signed
  URLs; excluded from every listing and from the search index.

A public page whose repository has become private is forced to `private` by the webhook handler
before the next render. The UI shows a banner: “The repository is private; the project is now
private.”

## Signed URLs

For private downloads and images:

```text
https://gallery.example/media/private/<artifactId>?exp=1712345678&sig=<hex>
```

- `sig = HMAC-SHA256(secret, artifactId + "|" + exp + "|" + userId)`
- TTL 5 minutes, single artifact, no wildcard.
- Constant-time compare; expired → `403` with a plain page.
- `Cache-Control: private, no-store`; no CDN caching.
- The secret rotates quarterly; signatures carry a key id.

**Implementation status:** the invite gate is enforced when `INVITE_REQUIRED=1`. Codes are
high-entropy, stored only as SHA-256, and consumed atomically with one `UPDATE`. The raw code is
shown once by `pnpm invites create`; OAuth carries only its hash in the signed transaction cookie.
Self-registration is a Forgejo setting: with `FORGEJO_DISABLE_REGISTRATION=false`, the gallery login
links to `${FORGEJO_PUBLIC_URL}/user/sign_up`. The gallery invite gate is independent; set
`INVITE_REQUIRED=0` to let any Forgejo account in. Existing identities and provider usernames in
`ADMIN_USERNAMES` sign in without a code.
`ADMIN_USERNAMES` is applied on every sign-in (including dev sign-in) and is the bootstrap path;
there is no web admin UI or audit entry yet.

## Invites (beta)

- Admins create invites: single-use or up to N uses, optional note, expiry 14 days.
- The OAuth callback requires a valid code unless the provider username is allowlisted.
- Invite codes are stored hashed; the raw code is shown once.
- Revoking an invite does not remove users who already accepted it.
- Invite acceptance is audited.

Bootstrap: `ADMIN_USERNAMES` (comma-separated) promotes matching accounts on first login. The
variable is read once at startup; changing it requires a restart. A manual SQL promotion is the
break-glass path.

## Account security

- Suspension (`users.suspended_at`) revokes all sessions and tokens and hides projects from the
  owner dashboard except for a notice.
- “Sign out everywhere” deletes all sessions for the user.
- Token and session tables are purged on schedule.
- Repeated OAuth failures are rate-limited per IP.
- Admin actions require a fresh session (< 12 hours old) — **later**; the MVP logs the action and
  relies on the session.

## Audit events

`sign_in`, `sign_out`, `token.create`, `token.revoke`, `project.create`, `project.publish`,
`project.visibility`, `project.delete`, `repo.connect`, `repo.disconnect`, `report.create`,
`report.resolve`, `project.feature`, `project.quarantine`, `user.suspend`, `invite.create`,
`invite.revoke`.

Each row: actor, action, subject type/id, IP, user agent (truncated), timestamp, and a small `meta`
object (old/new visibility, reason). Never tokens, never design contents.

## What is deliberately absent

- Passwords, password resets, email magic links.
- Social login beyond Forgejo/GitHub.
- Organizations, teams and per-project collaborators (later).
- Impersonation (admins can inspect, not act as a user).
- Public API keys without a user (no anonymous write).
