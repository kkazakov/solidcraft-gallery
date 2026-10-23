<svelte:head>
  <title>Privacy — SolidCraft Gallery</title>
  <meta
    name="description"
    content="Privacy policy for SolidCraft Gallery: what data the hosted instance collects, why, how long it is kept, and your rights."
  />
</svelte:head>

<section class="shell prose">
  <h1>Privacy policy</h1>
  <p><strong>Last updated:</strong> 23 October 2026</p>

  <p>
    This policy explains what personal data the hosted SolidCraft Gallery instance (the “Service”) collects, why it is
    collected, and what choices you have. The operator of this instance is the data controller. Self-hosted copies of
    the software are run by their own operators under their own policies.
  </p>
  <p>
    The Service is built to collect as little as possible. There are no advertising trackers and no third-party
    analytics scripts.
  </p>

  <h2>Data we collect</h2>
  <ul>
    <li>
      <strong>Account data.</strong> When you sign in with Forgejo, we receive your username, display name, avatar URL, provider
      account ID, and email address if your provider shares it. We do not receive your password. Email is stored for account
      administration and legal contact; it is never shown publicly and is not a login key.
    </li>
    <li>
      <strong>Content and metadata.</strong> Project titles, descriptions, tags, license identifiers, READMEs, designs, versions,
      previews, measurements, repository URLs and download counts.
    </li>
    <li>
      <strong>Session and security data.</strong> A hashed session token, IP address, user agent, and session creation, last-use
      and expiry times. Sign-in also uses a short-lived, signed OAuth cookie. Audit records cover sign-in and administrative
      actions. Server logs contain the request path, status, timing and a request ID, but not design contents or tokens.
    </li>
    <li>
      <strong>Preferences.</strong> Your theme choice is stored in your browser under <code>gallery-theme</code>. It
      stays on your device and is not sent to us. Your language choice is stored under <code>gallery-language</code>
      in your browser and mirrored in a cookie so pages render in that language.
    </li>
  </ul>

  <h2>Cookies</h2>
  <ul>
    <li>
      <code>__Host-gallery_session</code> keeps you signed in. It is essential, HttpOnly, Secure, SameSite=Lax, and expires
      after 30 days or when you sign out.
    </li>
    <li>
      <code>__Host-gallery_oauth</code> protects the sign-in round trip. It is essential, HttpOnly, Secure, SameSite=Lax,
      and expires after 10 minutes.
    </li>
    <li>
      <code>gallery-language</code> remembers your language choice. It is readable by the page, Secure, SameSite=Lax, expires
      after one year, and is cleared when you sign out.
    </li>
  </ul>
  <p>
    We do not use advertising, analytics or cross-site tracking cookies, and we do not embed third-party tracking
    pixels.
  </p>

  <h2>How we use data</h2>
  <ul>
    <li>To create and secure your account, sign you in, and keep your session working.</li>
    <li>To host, render, index, display, search and deliver the content you publish.</li>
    <li>To protect the Service, investigate abuse, and keep audit records of administrative actions.</li>
    <li>To respond to support, privacy, security and legal requests.</li>
    <li>To understand aggregate usage and fix bugs, using server logs rather than individual tracking.</li>
    <li>To comply with legal obligations and enforce our <a href="/terms">terms of service</a>.</li>
  </ul>
  <p>
    We do not use your data for advertising, and we do not make automated decisions that have legal or similarly
    significant effects about you.
  </p>

  <h2>Legal bases</h2>
  <p>Where data protection law requires a legal basis, we rely on:</p>
  <ul>
    <li><strong>Contract:</strong> to provide the Service and your account.</li>
    <li>
      <strong>Legitimate interests:</strong> to secure the Service, prevent abuse, keep it reliable, and understand aggregate
      usage. We balance these against your rights.
    </li>
    <li><strong>Legal obligation:</strong> to keep records or respond to lawful requests.</li>
    <li><strong>Consent:</strong> where we ask for it. You can withdraw consent at any time.</li>
  </ul>

  <h2>When we share data</h2>
  <ul>
    <li>
      <strong>Public content.</strong> Public project pages, your username, display name and avatar are visible to everyone
      and may be indexed by search engines. Downloads may be reused under the project’s license.
    </li>
    <li>
      <strong>Forgejo.</strong> Sign-in goes through your Forgejo account, which processes the request under its own privacy
      policy.
    </li>
    <li>
      <strong>Infrastructure providers.</strong> Hosting, database, storage and backup providers process data on our behalf
      under contracts that require appropriate safeguards.
    </li>
    <li>
      <strong>Legal and safety.</strong> We may disclose data if required by law, or if we believe in good faith that it is
      necessary to protect rights, safety or the Service. Where lawful, we will try to notify the affected user.
    </li>
    <li>
      <strong>No sale or rent.</strong> We do not sell, rent or trade personal data, or share it with ad networks.
    </li>
  </ul>

  <h2>Retention</h2>
  <p>We keep data only as long as needed for the purposes above. Our current schedule is:</p>
  <ul>
    <li>Account data: while your account exists. Deletion requests are actioned after a 7-day grace period.</li>
    <li>Sessions: up to 30 days; expired sessions are pruned.</li>
    <li>OAuth sign-in cookie: 10 minutes.</li>
    <li>Deleted projects: 30 days in soft delete, then purged along with their artifacts and repository data.</li>
    <li>Server logs and job history: 30 days.</li>
    <li>Audit records: 1 year.</li>
    <li>Reports: 2 years.</li>
    <li>
      Backups: kept on a rolling schedule and expire automatically. Residual copies may persist until they are
      overwritten.
    </li>
    <li>Aggregated or anonymized data that cannot identify you may be kept longer.</li>
  </ul>
  <p>
    Some content cannot be recalled: copies that others downloaded under a public license, and references in search
    engine caches, remain outside our control.
  </p>

  <h2>Security</h2>
  <p>
    We use HTTPS in production, store only hashed session tokens, set session cookies HttpOnly and SameSite, restrict
    administrative access, and render untrusted designs in a sandbox without network access. Administrative actions are
    audited.
  </p>
  <p>
    No system is perfectly secure. If you find a vulnerability, report it privately through the repository or ask for a
    private channel first; do not test against other users’ data.
  </p>

  <h2>Your rights</h2>
  <p>
    Depending on where you live, you may have the right to access, correct, delete, restrict or object to the processing
    of your personal data, to receive a portable copy, and to withdraw consent. To exercise a right, contact us through
    the repository. We may ask you to verify your identity, for example by signing in, before acting.
  </p>
  <p>
    We will respond within the time required by applicable law, normally within 30 days. If we cannot fulfil a request,
    we will explain why. You may also complain to your local data protection authority.
  </p>

  <h2>Children</h2>
  <p>
    The Service is not directed at children under 16, or the age of digital consent where you live. Do not create an
    account if you are below that age. If we learn that a child has created an account, we will delete it and the
    associated data. If you believe a child has an account, contact us.
  </p>

  <h2>International transfers</h2>
  <p>
    Data may be stored and processed in the European Union and in other countries where our providers operate. Where
    required, we rely on appropriate safeguards such as standard contractual clauses and the provider’s own transfer
    mechanisms.
  </p>

  <h2>Changes to this policy</h2>
  <p>
    We may update this policy. We will change the date above and, for material changes, post a notice on the Service.
    The current version always applies from its effective date.
  </p>

  <h2>Contact</h2>
  <p>
    Privacy questions and requests can be opened at
    <a href="https://github.com/kkazakov/solidcraft-gallery/issues">github.com/kkazakov/solidcraft-gallery/issues</a>.
    For personal data or security matters, ask for a private channel first; do not post personal information in a public
    issue.
  </p>
</section>
