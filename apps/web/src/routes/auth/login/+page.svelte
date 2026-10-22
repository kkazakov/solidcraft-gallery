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

  {#if data.error === 'invite'}
    <p class="notice">That invite code is missing, expired or already used.</p>
  {/if}

  <form method="GET" action="/auth/login" style="display: grid; gap: 12px">
    <input type="hidden" name="redirect" value={data.redirect} />
    <label for="invite" style="display: grid; gap: 6px; font-size: 13px; color: var(--muted)">
      Invite code {data.inviteRequired ? '(required for new accounts)' : '(optional)'}
      <input
        id="invite"
        name="invite"
        value={data.invite}
        autocomplete="off"
        placeholder="Paste your beta invite"
        style="padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
      />
    </label>
    <div style="display: grid; gap: 10px">
      {#each data.providers as provider (provider.id)}
        {#if provider.configured}
          <button class="button" type="submit" formaction={`/auth/login/${provider.id}`}>
            Continue with {provider.label}
          </button>
        {:else}
          <span class="button" style="opacity: 0.55; cursor: not-allowed">
            Continue with {provider.label} (not configured)
          </span>
        {/if}
      {/each}
    </div>
  </form>

  <p style="color: var(--muted); font-size: 13px; margin-top: 16px">
    Provider sign-in uses OAuth with PKCE. Existing accounts do not need an invite again.
  </p>

  {#if data.registrationUrl}
    <p style="color: var(--muted); font-size: 13px; margin-top: 8px">
      New here? <a href={data.registrationUrl}>Create a Forgejo account</a>, then return to this page.
      {#if data.inviteRequired}An invite is still required while the beta gate is on.{/if}
    </p>
  {/if}

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

<style>
  .notice {
    background: color-mix(in srgb, var(--warn) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--warn) 35%, var(--border));
    color: var(--warn);
    border-radius: 10px;
    padding: 10px 12px;
    margin: 0 0 16px;
    font-size: 13px;
  }
</style>
