<script lang="ts">
  import { getI18n } from '../../lib/i18n/context';

  const { t } = getI18n();
</script>

<svelte:head>
  <title>{t('privacy.title')}</title>
</svelte:head>

<section class="shell prose">
  <h1>{t('privacy.heading')}</h1>
  {@html t('privacy.body')}
</section>
