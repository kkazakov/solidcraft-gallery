<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Sign in — SolidCraft Gallery</title>
</svelte:head>

<section class="shell auth-page">
  <h1>Sign in</h1>
  <p class="page-sub">One identity for the gallery. Hosted projects use Forgejo; external repositories use GitHub.</p>

  {#if data.error === 'invite'}
    <p class="notice">That invite code is missing, expired or already used.</p>
  {/if}

  <form method="GET" action="/auth/login" class="form-stack">
    <input type="hidden" name="redirect" value={data.redirect} />
    <label class="field" for="invite">
      <span>Invite code {data.inviteRequired ? '(required for new accounts)' : '(optional)'}</span>
      <input
        id="invite"
        name="invite"
        value={data.invite}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        placeholder="Paste your beta invite"
      />
    </label>
    <div class="auth-providers">
      {#each data.providers as provider (provider.id)}
        {#if provider.configured}
          <button class="button block" type="submit" formaction={`/auth/login/${provider.id}`}>
            Continue with {provider.label}
          </button>
        {:else}
          <span class="button block disabled" aria-disabled="true">
            Continue with {provider.label} (not configured)
          </span>
        {/if}
      {/each}
    </div>
  </form>

  <p class="auth-note">Provider sign-in uses OAuth with PKCE. Existing accounts do not need an invite again.</p>

  {#if data.registrationUrl}
    <p class="auth-note">
      New here? <a href={data.registrationUrl}>Create a Forgejo account</a>, then return to this page.
      {#if data.inviteRequired}An invite is still required while the beta gate is on.{/if}
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
