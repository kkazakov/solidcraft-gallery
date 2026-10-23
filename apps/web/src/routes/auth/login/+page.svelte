<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t } = getI18n();

  function providerHref(id: string): string {
    const params = new URLSearchParams({ redirect: data.redirect });
    if (data.invite) params.set('invite', data.invite);
    return `/auth/login/${id}?${params.toString()}`;
  }
</script>

<svelte:head>
  <title>{t('login.title')}</title>
</svelte:head>

<section class="shell auth-page">
  <h1>{t('login.heading')}</h1>
  <p class="page-sub">{t('login.intro')}</p>

  {#if data.error === 'invite' && data.inviteRequired}
    <p class="notice">{t('login.inviteOnly')}</p>
  {/if}

  <div class="auth-providers">
    {#each data.providers as provider (provider.id)}
      {#if provider.configured}
        <a class="button block" href={providerHref(provider.id)}>
          {t('login.continueWith', { provider: provider.label })}
        </a>
      {:else}
        <span class="button block disabled" aria-disabled="true">
          {t('login.notConfigured', { provider: provider.label })}
        </span>
      {/if}
    {/each}
  </div>

  <p class="auth-note">{t('login.oauthNote')}</p>

  {#if data.registrationUrl}
    <p class="auth-note">
      {t('login.newHere')} <a href={data.registrationUrl}>{t('login.createAccount')}</a>{t('login.newHereAfter')}
    </p>
  {/if}

  {#if data.devLogin}
    <div class="card auth-dev">
      <h2>{t('login.devHeading')}</h2>
      <p>
        {t('login.devBody.before')} <code>NODE_ENV=production</code>{t('login.devBody.after')}
      </p>
      <form method="GET" action="/auth/dev" class="form-row">
        <label class="field">
          <span class="sr-only">{t('login.username')}</span>
          <input id="username" name="username" value="dev" autocomplete="off" spellcheck="false" />
        </label>
        <button class="button primary" type="submit">{t('login.signIn')}</button>
      </form>
    </div>
  {/if}
</section>
