<script lang="ts">
  import { page } from '$app/state';
  import { getI18n } from '../lib/i18n/context';

  const { t } = getI18n();
</script>

<svelte:head>
  <title>{t('error.title', { status: page.status })}</title>
</svelte:head>

<section class="shell error-page">
  <p class="status-code">{t('error.status', { status: page.status })}</p>
  <h1>{page.status === 404 ? t('error.notFound') : t('error.broken')}</h1>
  <p>
    {page.status === 404 ? t('error.notFoundBody') : t('error.brokenBody')}
  </p>
  <p><a class="button" href="/">{t('error.goHome')}</a></p>
</section>
