<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t } = getI18n();

  // Enter in the invite field submits to the default provider's start URL.
  const defaultProvider = $derived(data.providers.find((provider) => provider.configured));
  const formAction = $derived(defaultProvider ? `/auth/login/${defaultProvider.id}` : '/auth/login');
</script>

<svelte:head>
  <title>{t('login.title')}</title>
</svelte:head>

<section class="shell auth-page">
  <h1>{t('login.heading')}</h1>
  <p class="page-sub">{t('login.intro')}</p>

  {#if data.registered}
    <p class="notice notice-ok">{t('login.registered')}</p>
  {/if}

  {#if data.error === 'invite' && data.inviteRequired}
    <p class="notice">{t('login.inviteOnly')}</p>
  {/if}

  {#if data.inviteRequired && !data.registrationUrl}
    <p class="auth-note">
      {t('login.operatorAccounts')}
      <a href={data.invite ? `/auth/register?invite=${encodeURIComponent(data.invite)}` : '/auth/register'}>
        {t('login.createWithInvite')}
      </a>
    </p>
  {/if}

  <form method="GET" action={formAction} class="form-stack">
    <input type="hidden" name="redirect" value={data.redirect} />

    {#if data.inviteRequired || data.invite}
      <label class="field" for="invite">
        <span>
          {t('login.inviteLabel')}
          <span class="field-hint">
            {data.inviteRequired ? t('login.inviteRequiredHint') : t('login.inviteOptionalHint')}
          </span>
        </span>
        <input
          id="invite"
          name="invite"
          value={data.invite}
          autocomplete="off"
          spellcheck="false"
          placeholder={t('login.invitePlaceholder')}
        />
      </label>
    {/if}

    <div class="auth-providers">
      {#each data.providers as provider (provider.id)}
        {#if provider.configured}
          <button class="button block" type="submit" formaction={`/auth/login/${provider.id}`}>
            {t('login.continueWith', { provider: provider.label })}
          </button>
        {:else}
          <span class="button block disabled" aria-disabled="true">
            {t('login.notConfigured', { provider: provider.label })}
          </span>
        {/if}
      {/each}
    </div>
  </form>

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
