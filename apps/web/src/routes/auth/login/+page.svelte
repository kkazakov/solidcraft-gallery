<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign in — SolidCraft Gallery</title>
</svelte:head>

<section class="shell auth-page">
  <h1>Sign in</h1>
  <p class="page-sub">Use your Forgejo account to publish designs and manage your projects.</p>

  {#if data.error === 'invite'}
    <p class="notice">This instance is invite-only. Ask an administrator for access.</p>
  {/if}

  <div class="auth-providers">
    {#each data.providers as provider (provider.id)}
      {#if provider.configured}
        <a
          class="button block"
          href={`/auth/login/${provider.id}?redirect=${encodeURIComponent(data.redirect)}`}
        >
          Continue with {provider.label}
        </a>
      {:else}
        <span class="button block disabled" aria-disabled="true">{provider.label} sign-in is not configured</span>
      {/if}
    {/each}
  </div>

  <p class="auth-note">Sign-in uses OAuth with PKCE. You stay signed in on this browser.</p>

  {#if data.registrationUrl}
    <p class="auth-note">
      New here? <a href={data.registrationUrl}>Create a Forgejo account</a>, then return to this page.
    </p>
  {/if}

  {#if data.devLogin}
    <div class="card auth-dev">
      <h2>Development sign-in</h2>
      <p>Creates a local account with no provider. Disabled when <code>NODE_ENV=production</code>.</p>
      <form method="GET" action="/auth/dev" class="form-row">
        <label class="field">
          <span class="sr-only">Username</span>
          <input id="username" name="username" value="dev" autocomplete="off" spellcheck="false" />
        </label>
        <button class="button primary" type="submit">Sign in</button>
      </form>
    </div>
  {/if}
</section>
