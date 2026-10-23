<script lang="ts">
  import { getI18n } from '../../lib/i18n/context';

  const { t } = getI18n();
</script>

<svelte:head>
  <title>{t('about.title')}</title>
  <meta name="description" content={t('about.description')} />
</svelte:head>

<section class="shell prose">
  <h1>{t('about.heading')}</h1>
  {@html t('about.intro')}
  {@html t('about.repo')}

  <h2>{t('about.canDoHeading')}</h2>
  {@html t('about.canDo')}

  <h2>{t('about.purposeHeading')}</h2>
  {@html t('about.purpose')}

  <h2>{t('about.statusHeading')}</h2>
  {@html t('about.status')}

  <h2>{t('about.builtHeading')}</h2>
  {@html t('about.built')}
</section>
