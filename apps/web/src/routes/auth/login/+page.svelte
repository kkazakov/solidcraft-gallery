<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign in — SolidCraft Gallery</title>
</svelte:head>

<section class="shell" style="padding: 64px 0 96px; max-width: 520px">
  <p class="eyebrow">Account</p>
  <h1 style="letter-spacing: -0.03em; margin: 16px 0 8px">Sign in</h1>
  <p style="color: var(--muted); margin: 0 0 28px">
    One identity for the gallery. Hosted projects use Forgejo; external repositories use GitHub.
  </p>

  <div style="display: grid; gap: 10px">
    <a class="button" href="/auth/login/forgejo">Continue with Forgejo</a>
    <a class="button" href="/auth/login/github">Continue with GitHub</a>
  </div>

  <p style="color: var(--muted); font-size: 13px; margin-top: 16px">
    Provider sign-in is being wired in M1. If it is not configured on this instance, use the development sign-in below.
  </p>

  {#if data.devLogin}
    <div class="card" style="margin-top: 28px">
      <h2>Development sign-in</h2>
      <p style="margin-bottom: 12px">
        Creates a local account with no provider. Disabled when <code>NODE_ENV=production</code>.
      </p>
      <form method="GET" action="/auth/dev" style="display: flex; gap: 8px">
        <label for="username" style="position: absolute; left: -9999px">Username</label>
        <input
          id="username"
          name="username"
          value="dev"
          autocomplete="off"
          style="flex: 1; padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
        />
        <button class="button primary" type="submit">Sign in</button>
      </form>
    </div>
  {/if}
</section>
