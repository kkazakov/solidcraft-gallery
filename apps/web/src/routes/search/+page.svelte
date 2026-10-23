<script lang="ts">
  import DesignCard from '../../lib/components/DesignCard.svelte';
  import { getI18n } from '../../lib/i18n/context';

  let { data } = $props();
  const { t, tp } = getI18n();

  function pageHref(target: number): string {
    const params = new URLSearchParams();
    if (data.q) params.set('q', data.q);
    if (data.tag) params.set('tag', data.tag);
    if (data.license) params.set('license', data.license);
    if (data.sort !== 'relevance') params.set('sort', data.sort);
    if (target > 1) params.set('page', String(target));
    const query = params.toString();
    return query ? `/search?${query}` : '/search';
  }

  function clearHref(remove: 'q' | 'tag' | 'license'): string {
    const params = new URLSearchParams();
    if (data.q && remove !== 'q') params.set('q', data.q);
    if (data.tag && remove !== 'tag') params.set('tag', data.tag);
    if (data.license && remove !== 'license') params.set('license', data.license);
    const query = params.toString();
    return query ? `/search?${query}` : '/search';
  }
</script>

<svelte:head>
  <title>{data.q ? t('search.titleQuery', { query: data.q }) : t('search.title')} — SolidCraft Gallery</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="shell page-head">
  <h1>{t('search.heading')}</h1>

  <form method="GET" action="/search" class="search-form" role="search" aria-label={t('search.formLabel')}>
    {#if data.tag}
      <input type="hidden" name="tag" value={data.tag} />
    {/if}
    <label for="q" class="sr-only">{t('search.query')}</label>
    <input id="q" name="q" value={data.q} placeholder={t('search.placeholder')} autocomplete="off" spellcheck="false" />
    <label for="license" class="sr-only">{t('search.license')}</label>
    <select id="license" name="license">
      <option value="" selected={!data.license}>{t('search.anyLicense')}</option>
      {#each data.licenses as entry (entry.license)}
        <option value={entry.license} selected={data.license === entry.license}>
          {entry.license} ({entry.count})
        </option>
      {/each}
    </select>
    <label for="sort" class="sr-only">{t('search.sort')}</label>
    <select id="sort" name="sort">
      <option value="relevance" selected={data.sort === 'relevance'}>{t('search.sortRelevance')}</option>
      <option value="newest" selected={data.sort === 'newest'}>{t('search.sortNewest')}</option>
      <option value="popular" selected={data.sort === 'popular'}>{t('search.sortPopular')}</option>
    </select>
    <button class="button primary" type="submit">{t('common.search')}</button>
  </form>

  <div class="filters">
    {#if data.q}
      <a class="badge" href={clearHref('q')}>{t('search.filterQuery', { value: data.q })}</a>
    {/if}
    {#if data.tag}
      <a class="badge" href={clearHref('tag')}>{t('search.filterTag', { value: data.tag })}</a>
    {/if}
    {#if data.license}
      <a class="badge" href={clearHref('license')}>{t('search.filterLicense', { value: data.license })}</a>
    {/if}
    {#if data.q || data.tag || data.license}
      <a class="clear" href="/search">{t('search.clearAll')}</a>
    {/if}
  </div>
</section>

<section class="shell section">
  {#if data.dbDown}
    <article class="card empty-card">
      <h2>{t('search.unavailableTitle')}</h2>
      <p>{t('search.unavailableBody')}</p>
    </article>
  {:else if data.result.items.length === 0}
    <article class="card empty-card">
      <h2>{t('search.emptyTitle')}</h2>
      <p>{t('search.emptyBody')}</p>
      {#if data.tags.length > 0}
        <div class="tag-row" style="margin-top: 12px">
          {#each data.tags.slice(0, 8) as entry (entry.tag)}
            <a class="badge" href={`/search?tag=${encodeURIComponent(entry.tag)}`}>{entry.tag}</a>
          {/each}
        </div>
      {/if}
    </article>
  {:else}
    <p class="result-count">
      {data.result.fallback ? `${t('search.fallback')} ` : ''}
      {tp('search.resultCount', data.result.total)}{#if data.page > 1}
        · {t('search.pageShort', { page: data.page })}{/if}
    </p>
    <div class="design-grid">
      {#each data.result.items as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>

    {#if data.pages > 1}
      <nav class="pagination" aria-label={t('common.pagination')}>
        {#if data.page > 1}
          <a class="button small" href={pageHref(data.page - 1)}>{t('search.previous')}</a>
        {/if}
        <span>{t('search.page', { page: data.page, pages: data.pages })}</span>
        {#if data.page < data.pages}
          <a class="button small" href={pageHref(data.page + 1)}>{t('search.next')}</a>
        {/if}
      </nav>
    {/if}
  {/if}
</section>
