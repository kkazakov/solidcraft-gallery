# 11 — Security

The site parses files produced by a desktop CAD application, stores them, and republishes them. It
holds OAuth tokens, private projects and an admin surface. The security model assumes the design
file is hostile, the repository is hostile, and the network is hostile.

## Assets

| Asset | Why it matters |
|---|---|
| OAuth access tokens | Can create/push repositories in a user's forge account |
| Sessions and API tokens | Account takeover |
| Private designs and metadata | Confidentiality, embargoed work |
| User emails | Privacy |
| Service availability | The gallery is the product |
| Reputation | Malware, infringing content, spam |

## Adversaries

| Adversary | Capability |
|---|---|
| Anonymous internet | Scraping, spam reports, credential stuffing against OAuth (limited), DoS |
| Malicious author | Crafted `.solidcraft`, huge archives, malicious README, license abuse |
| Compromised provider | Forged webhooks, malicious metadata (mitigated by signature + schema) |
| Malicious repository | Hooks, symlinks, submodules, LFS pointers, path names |
| Curious tenant | Guessing ids, signed-URL sharing, search leakage |
| Insider / admin | Elevated by design; audited |

## Threat model and controls

| # | Threat | Impact | Controls |
|---|---|---|---|
| T1 | Parser exploit in a `.solidcraft` | RCE in worker | Sandbox (T2), size caps, no network, non-root, seccomp |
| T2 | Sandbox escape | Host compromise | `nsjail`, user namespaces, read-only root, no caps, dedicated worker host at scale |
| T3 | Zip bomb / decompression bomb | Disk/memory exhaustion | 25 MB compressed, 512 MiB expanded, 10k entries, streaming abort, tmpfs quota |
| T4 | Path traversal in archive | Write outside workdir | Never extract to the filesystem by name; in-memory reader; output names generated |
| T5 | SSRF via repo URL | Access internal services | HTTPS only, resolve+block private/link-local/metadata, no redirects, allowlist |
| T6 | XSS via README/metadata | Session theft | Markdown sanitizer allowlist, no raw HTML, CSP nonce, escaping by framework |
| T7 | CSRF on publish/delete | Unauthorized action | SameSite=Lax, Origin check, double-submit token |
| T8 | IDOR on private projects | Data leak | Central `authorizeProject`, 404 for invisible, view `public_projects` for listings |
| T9 | Token leakage in logs/URLs | Account takeover | Never log tokens, redaction, no tokens in query strings, encryption at rest |
| T10 | Forged webhook | Inject a version | HMAC/secret per repo, constant-time, raw body, replay window, delivery dedupe |
| T11 | Git hook execution | RCE in worker | `core.hooksPath=/dev/null`, no submodules, no LFS smudge, `-c` overrides |
| T12 | Symlink/submodule in repo | Read host files | Only regular blobs are fetched by path; symlinks ignored; submodules disabled |
| T13 | Resource exhaustion | Outage | Rate limits, queue caps, per-user quotas, timeouts, DB statement timeouts |
| T14 | Spam / illegal content | Reputation, legal | Invite beta, report queue, quarantine, terms, DMCA, audit |
| T15 | Supply-chain compromise | RCE | Lockfiles, pinned digests, SBOM, provenance, minimal deps |
| T16 | Signed-URL sharing | Private leak | 5-min TTL, bound artifact+user, no CDN, invalidation on revoke |
| T17 | Admin account takeover | Full control | No passwords, short sessions, audit, fresh-auth for destructive actions (later) |
| T18 | Enumeration of private projects | Metadata leak | 404, no timing difference, no search suggestions, no counters |
| T19 | Malicious image in container | Browser exploit / tracking | Embedded images are never served as site images; covers re-encoded |
| T20 | Dependency/CLI drift | Unexpected behavior | Pinned CLI, contract tests, checksums |

## Untrusted design handling

1. **Size first.** Reject `Content-Length > 25 MB`; stream with a hard cap; abort past it.
2. **Signature.** ZIP (`PK\x03\x04`) or UTF-8 JSON; anything else is `design_unreadable`.
3. **Container validation before extraction.** `container.json` format, entry count, per-entry and
   total expanded size, duplicate names, no absolute/`..` names, no ZIP64/multi-disk. The upstream
   reader enforces most of this; the site enforces its stricter 25 MB.
4. **No filesystem-name extraction.** Entries are read into memory by known names
   (`container.json`, `document.json`, `blobs/...`); nothing is written using an archive name.
5. **JSON depth/size.** A streaming parser with a depth limit and a 64 MB document cap.
6. **Images.** Embedded canvas/thumbnail bytes are validated by magic and dimensions, re-encoded
   with `sharp` (metadata stripped), and only then stored. They are never served as the project's
   images directly.
7. **Everything else stays in the download.** A visitor who downloads the design gets the original
   bytes; the page warns that files from the internet are untrusted.

## Render sandbox

The worker invokes `solidcraft-cli` through `nsjail` (or `bubblewrap`) with:

| Control | Setting |
|---|---|
| Network namespace | empty, no interfaces |
| User | dedicated uid, no root, no capabilities |
| Filesystem | read-only `/`, tmpfs `/work`, bind-mounted CLI, no host paths |
| Memory | 1 GiB address space |
| CPU | 1 core, 60 s CPU and wall limits |
| Processes | 64 |
| File size | 32 MB output |
| Environment | `PATH`, `HOME`, `TMPDIR` only |
| Seccomp | default-deny profile allowing the CLI's syscalls |

The process group is killed on timeout. Outputs are validated (PNG/STEP magic, dimensions, size)
before storage. A render crash is contained to the job.

Residual: a kernel bug or a sandbox misconfiguration. Mitigations: patched host, dedicated worker
container, no database superuser in the worker, egress firewall, and an alert on unexpected child
processes.

## Web security

### Headers

```text
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<random>';
  style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self';
  connect-src 'self'; frame-ancestors 'none'; base-uri 'none';
  form-action 'self'; object-src 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

`style-src 'unsafe-inline'` is the pragmatic Svelte compromise; move to hashes/nonces when the
component set stabilizes. Never add `script-src 'unsafe-inline'`.

### Markdown

- `marked` with HTML disabled, then `sanitize-html` with an explicit allowlist:
  `p, br, em, strong, ul, ol, li, blockquote, code, pre, h2–h4, a, table, thead, tbody, tr, th, td, hr`.
- Attributes: `href` (http/https/mailto only), `title`, `colspan`, `rowspan`. No `style`, no `class`,
  no `id`, no event handlers.
- Links get `rel="nofollow noopener noreferrer"` and `target="_blank"` only for external hosts.
- Images are removed in v1 (see T19); a link to an image is shown as a link.
- Heading anchors are generated from a slug of the text, with a prefix to avoid collisions.

### Content-Disposition

Download filenames are generated (`{slug}-{tag}.solidcraft`), sanitized to ASCII, quoted, and sent
with `Content-Type: application/octet-stream`.

## Secrets

| Secret | Storage | Rotation |
|---|---|---|
| `SESSION_SECRET` | env / secret file | quarterly, invalidates sessions |
| `TOKEN_ENC_KEY` | env, key id prefix | yearly, re-encrypt job |
| `SIGNED_URL_SECRET` | env | quarterly |
| `FORGEJO_CLIENT_SECRET` | env | on incident |
| `GITHUB_CLIENT_SECRET` | env | on incident |
| DB password | env | yearly |
| Admin bootstrap | env (`ADMIN_USERNAMES`) | on change |

Rules: no secrets in the repository, no secrets in logs, `.env` files `0600`, Docker secrets or a
mounted file in production, separate values per environment. A secret scan runs in CI.

## Rate limits and quotas

At the edge (Caddy) and in the app: per-IP request limits, per-user publish/connect/report limits,
body caps, render concurrency, queue depth. A global kill switch (`PUBLISH_DISABLED`,
`WORKER_PAUSED`) is available to admins.

## Logging and privacy

- Structured logs; no design contents, no tokens, no full IPs after 30 days.
- `Authorization`, `Cookie`, `Set-Cookie` redacted by the logger.
- Error tracking (if enabled) scrubs request bodies for `/auth`, `/tokens`, `/publish`.
- Access logs retained 30 days; audit 365 days.
- Data export and deletion are implemented (JSON export, account deletion with 7-day grace).

## Incident response

1. **Detect** — alerts on render failures, queue depth, 5xx, auth anomalies, disk.
2. **Contain** — disable the affected repo/project, pause the worker, rotate the suspected secret,
   revoke sessions/tokens.
3. **Eradicate** — patch, rebuild images, redeploy, verify.
4. **Recover** — restore from backup if integrity is in doubt, replay queue.
5. **Report** — notify affected users if personal data is involved (GDPR 72 h), publish a
   post-mortem for security-relevant incidents.

A one-page runbook lives in [12 — Operations](12-operations.md#runbooks); the security contact is
published at `/.well-known/security.txt`.

## Security testing

- Authorization matrix tests for every route (anonymous/owner/admin/other).
- SSRF test suite: loopback, RFC1918, metadata, IPv6, redirects, DNS rebinding (mock resolver).
- XSS corpus for Markdown and metadata; CSP regression with Playwright.
- Zip-bomb and malformed-container fixtures; fuzz the ingest parser (upstream fuzz corpus reused).
- Sandbox escape smoke test: a fixture that tries to open a socket or read `/etc/passwd` must fail.
- Dependency audit and secret scan in CI; `cargo audit` equivalent for the CLI image.
- Annual external review before open registration.
