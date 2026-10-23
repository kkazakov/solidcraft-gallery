<script lang="ts">
  import DesignCard from '../lib/components/DesignCard.svelte';
  import { getI18n } from '../lib/i18n/context';

  let { data } = $props();
  const { t, tp } = getI18n();

  const publishHref = $derived(
    data.viewer ? '/dashboard/projects/new' : '/auth/login?redirect=%2Fdashboard%2Fprojects%2Fnew',
  );
</script>

<svelte:head>
  <title>{t('home.title')}</title>
  <meta name="description" content={t('home.description')} />
</svelte:head>

<section class="hero shell">
  <p class="meta-line">
    <span class="dot"></span>
    <span>{data.total > 0 ? tp('home.publicDesigns', data.total) : t('home.earlyPreview')}</span>
    <span class="sep" aria-hidden="true">·</span>
    <span>v{data.version}</span>
  </p>
  <h1>{t('home.headlineLine1')}<br />{t('home.headlineLine2')}</h1>
  <p class="lede">
    {t('home.lede.before')} <code>.solidcraft</code>
    {t('home.lede.after')}
  </p>

  <form method="GET" action="/search" class="hero-search">
    <label for="q" class="sr-only">{t('home.searchDesigns')}</label>
    <input id="q" name="q" placeholder={t('home.searchPlaceholder')} autocomplete="off" spellcheck="false" />
    <button class="button primary" type="submit">{t('common.search')}</button>
  </form>

  <div class="actions">
    <a class="button" href={publishHref}>{t('home.publishDesign')}</a>
    <a class="quiet-link" href="/about">{t('home.howItWorks')}</a>
  </div>
</section>

{#if data.dbDown}
  <section class="shell section">
    <article class="card empty-card">
      <h2>{t('home.dbDownTitle')}</h2>
      <p>{t('home.dbDownBody')}</p>
    </article>
  </section>
{:else if data.total === 0}
  <section class="shell section">
    <article class="card empty-card">
      <h2>{t('home.emptyTitle')}</h2>
      <p>
        {t('home.emptyBody.before')} <code>.solidcraft</code>
        {t('home.emptyBody.after')}
      </p>
      <p class="form-message"><a class="button primary" href={publishHref}>{t('home.startProject')}</a></p>
    </article>
  </section>
{:else}
  {#if data.featured.length > 0}
    <section class="shell section">
      <div class="section-head">
        <h2>{t('home.featured')}</h2>
        <a href="/search">{t('home.browseAll')}</a>
      </div>
      <div class="design-grid">
        {#each data.featured as project (project.id)}
          <DesignCard {project} />
        {/each}
      </div>
    </section>
  {/if}

  <section class="shell section">
    <div class="section-head">
      <h2>{t('home.recent')}</h2>
      <a href="/search">{t('home.browseAll')}</a>
    </div>
    <div class="design-grid">
      {#each data.recent as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>
  </section>

  {#if data.tags.length > 0}
    <section class="shell section">
      <div class="section-head">
        <h2>{t('home.tags')}</h2>
      </div>
      <div class="tag-cloud">
        {#each data.tags as tag (tag.tag)}
          <a class="badge" href={`/search?tag=${encodeURIComponent(tag.tag)}`}>
            {tag.tag} <span>{tag.count}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/if}
