<script lang="ts">
  import '../app.css';
  import { setI18n } from '../lib/i18n/context';

  let { data, children } = $props();

  // The locale is resolved per request and the app is server-rendered, so the
  // initial prop is final for this page instance.
  // svelte-ignore state_referenced_locally
  const { t } = setI18n(data.locale);
  const themeLabels = {
    system: t('theme.label.system'),
    light: t('theme.label.light'),
    dark: t('theme.label.dark'),
  };
  const themeDescription = t('theme.describe', { mode: themeLabels.system, next: themeLabels.light });
</script>

<a class="skip-link" href="#main">{t('common.skipToContent')}</a>

<header class="site-header">
  <div class="shell">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">SC</span>
      <span>SolidCraft Gallery</span>
    </a>
    <nav class="nav" aria-label={t('common.mainNav')}>
      <a href="/search">{t('common.search')}</a>
      <a href="/about">{t('common.about')}</a>
      {#if data.viewer}
        <a href="/dashboard">{t('common.dashboard')}</a>
      {:else}
        <a href="/auth/login">{t('common.signIn')}</a>
      {/if}
      <a href="https://github.com/kkazakov/solidcraft-gallery">{t('common.github')}</a>
      <button
        id="theme-toggle"
        class="theme-toggle"
        type="button"
        aria-label={themeDescription}
        title={themeDescription}
        data-label-system={themeLabels.system}
        data-label-light={themeLabels.light}
        data-label-dark={themeLabels.dark}
        data-label-template={t('theme.describe')}
      >
        <svg class="theme-icon theme-icon-system" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M12 4a8 8 0 0 1 0 16V4Z"></path>
        </svg>
        <svg class="theme-icon theme-icon-light" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          ></path>
        </svg>
        <svg class="theme-icon theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"></path>
        </svg>
      </button>
    </nav>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<footer class="site-footer">
  <div class="shell">
    <span class="footer-note">{t('common.footerNote')}</span>
    <nav class="footer-links" aria-label={t('common.footerNav')}>
      <a href="/about">{t('common.about')}</a>
      <a href="/terms">{t('common.terms')}</a>
      <a href="/privacy">{t('common.privacy')}</a>
      <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a>
    </nav>
  </div>
  <div class="shell footer-updated">
    <span>
      {t('common.updated')}
      <time datetime={data.siteUpdated.iso} data-site-updated>{data.siteUpdated.label}</time>
    </span>
  </div>
</footer>
