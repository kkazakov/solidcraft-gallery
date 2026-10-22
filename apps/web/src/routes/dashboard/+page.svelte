<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Dashboard — SolidCraft Gallery</title>
</svelte:head>

<section class="shell" style="padding: 48px 0 80px">
  <p class="eyebrow">Dashboard</p>
  <h1 style="letter-spacing: -0.03em; margin: 14px 0 8px">Hello, {data.viewer.username}</h1>
  <p style="color: var(--muted); margin: 0 0 32px">
    Signed in as <span class="mono">{data.viewer.role}</span>. Hosted projects and publishing arrive with the next
    milestone; the account and session path is live.
  </p>

  <div class="grid" style="padding: 0 0 32px">
    <article class="card">
      <h2>Projects</h2>
      <p>No projects yet. Creating a hosted project lands in M1.</p>
    </article>
    <article class="card">
      <h2>Connected repositories</h2>
      <p>Connect a public GitHub, GitLab or Gitea repository in M3.</p>
    </article>
    <article class="card">
      <h2>Account</h2>
      <p>Session cookie, hashed token and database record are working. Provider linking follows with OAuth.</p>
    </article>
  </div>

  <form method="POST" action="/auth/logout">
    <button class="button" type="submit">Sign out</button>
  </form>
</section>
