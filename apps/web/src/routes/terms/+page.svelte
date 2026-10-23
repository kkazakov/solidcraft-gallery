<script lang="ts">
  import { getI18n } from '../../lib/i18n/context';

  const { t } = getI18n();
</script>

<svelte:head>
  <title>{t('terms.title')}</title>
</svelte:head>

<section class="shell prose">
  <h1>{t('terms.heading')}</h1>
  {@html t('terms.body')}
</section>
