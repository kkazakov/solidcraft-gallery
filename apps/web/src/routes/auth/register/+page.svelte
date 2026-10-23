<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';
  import type { MessageKey } from '../../../lib/i18n/messages';

  let { data, form } = $props();
  const { t } = getI18n();

  const ERRORS: Record<string, MessageKey> = {
    invite: 'register.errorInvite',
    closed: 'register.errorInvite',
    'username-taken': 'register.errorUsername',
    'username-format': 'register.errorInvalid',
    'email-format': 'register.errorInvalid',
    password: 'register.errorPassword',
    unavailable: 'register.errorUnavailable',
    provider: 'register.errorFailed',
    failed: 'register.errorFailed',
    rate: 'register.errorFailed',
  };

  const errorKey = $derived(form?.error ? (ERRORS[form.error] ?? 'register.errorFailed') : null);
</script>

<svelte:head>
  <title>{t('register.title')}</title>
</svelte:head>

<section class="shell auth-page">
  <h1>{t('register.heading')}</h1>

  {#if !data.inviteRequired}
    <p class="notice">{t('register.closed')}</p>
    <p class="auth-note"><a href="/auth/login">{t('register.signIn')}</a></p>
  {:else if !data.forgejoReady}
    <p class="notice">{t('register.errorUnavailable')}</p>
    <p class="auth-note"><a href="/auth/login">{t('register.signIn')}</a></p>
  {:else if !data.usable}
    <p class="page-sub">{t('register.intro')}</p>
    {#if data.invite}
      <p class="notice">{t('register.codeInvalid')}</p>
    {/if}
    <form method="GET" action="/auth/register" class="form-stack">
      <label class="field" for="invite">
        <span>{t('register.codeLabel')}</span>
        <input id="invite" name="invite" value={data.invite} autocomplete="off" spellcheck="false" />
      </label>
      <button class="button primary" type="submit">{t('register.codeSubmit')}</button>
    </form>
    <p class="auth-note"><a href="/auth/login">{t('register.signIn')}</a></p>
  {:else}
    <p class="page-sub">{t('register.intro')}</p>

    <form method="POST" class="form-stack">
      <input type="hidden" name="invite" value={data.invite} />

      {#if errorKey}
        <p class="notice">{t(errorKey)}</p>
      {/if}
      {#if form?.detail}
        <p class="field-hint">{form.detail}</p>
      {/if}
      {#if form?.error === 'username-taken'}
        <p class="auth-note">
          <a href={`/auth/login?invite=${encodeURIComponent(data.invite)}`}>{t('register.existingHint')}</a>
        </p>
      {/if}

      <label class="field" for="username">
        <span>{t('register.usernameLabel')}</span>
        <input
          id="username"
          name="username"
          value={form?.username ?? ''}
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          minlength="3"
          maxlength="32"
          required
        />
      </label>
      <p class="field-hint">{t('register.usernameHint')}</p>

      <label class="field" for="email">
        <span>{t('register.emailLabel')}</span>
        <input id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="email" spellcheck="false" />
      </label>
      <p class="field-hint">{t('register.emailHint')}</p>

      <label class="field" for="password">
        <span>{t('register.passwordLabel')}</span>
        <input
          id="password"
          name="password"
          type="password"
          autocomplete="new-password"
          minlength="8"
          maxlength="128"
          required
        />
      </label>
      <p class="field-hint">{t('register.passwordHint')}</p>

      <button class="button primary" type="submit">{t('register.submit')}</button>
    </form>

    <p class="auth-note"><a href="/auth/login">{t('register.signIn')}</a></p>
  {/if}
</section>
