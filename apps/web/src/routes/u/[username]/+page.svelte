<script lang="ts">
  import DesignCard from '../../../lib/components/DesignCard.svelte';
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t, tp } = getI18n();
</script>

<svelte:head>
  <title>{t('user.title', { username: data.user.username })}</title>
  <meta name="description" content={t('user.description', { username: data.user.username })} />
</svelte:head>

<section class="shell page-head">
  <h1>{data.user.username}</h1>
  <p class="page-sub">{tp('user.designCount', data.projects.length)}</p>
</section>

<section class="shell section">
  {#if data.projects.length === 0}
    <article class="card empty-card">
      <h2>{t('user.emptyTitle')}</h2>
      <p>{t('user.emptyBody')}</p>
    </article>
  {:else}
    <div class="design-grid">
      {#each data.projects as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>
  {/if}
</section>
