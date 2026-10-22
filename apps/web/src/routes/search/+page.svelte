<script lang="ts">
  import DesignCard from '../../lib/components/DesignCard.svelte';

  let { data } = $props();

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
  <title>{data.q ? `${data.q} — search` : 'Search'} — SolidCraft Gallery</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="shell" style="padding: 48px 0 24px">
  <p class="eyebrow">Search</p>
  <h1 style="letter-spacing: -0.03em; font-size: clamp(30px, 4vw, 44px); margin: 14px 0 20px">Find a design</h1>

  <form method="GET" action="/search" class="search-form">
    {#if data.tag}
      <input type="hidden" name="tag" value={data.tag} />
    {/if}
    <label for="q" class="sr-only">Query</label>
    <input id="q" name="q" value={data.q} placeholder="Enclosure, bracket, M3 standoff…" autocomplete="off" />
    <label for="license" class="sr-only">License</label>
    <select id="license" name="license">
      <option value="" selected={!data.license}>Any license</option>
      {#each data.licenses as entry (entry.license)}
        <option value={entry.license} selected={data.license === entry.license}>
          {entry.license} ({entry.count})
        </option>
      {/each}
    </select>
    <label for="sort" class="sr-only">Sort</label>
    <select id="sort" name="sort">
      <option value="relevance" selected={data.sort === 'relevance'}>Relevance</option>
      <option value="newest" selected={data.sort === 'newest'}>Newest</option>
      <option value="popular" selected={data.sort === 'popular'}>Most downloaded</option>
    </select>
    <button class="button primary" type="submit">Search</button>
  </form>

  <div class="filters">
    {#if data.q}
      <a class="badge" href={clearHref('q')}>q: {data.q} ×</a>
    {/if}
    {#if data.tag}
      <a class="badge" href={clearHref('tag')}>tag: {data.tag} ×</a>
    {/if}
    {#if data.license}
      <a class="badge" href={clearHref('license')}>license: {data.license} ×</a>
    {/if}
    {#if data.q || data.tag || data.license}
      <a class="clear" href="/search">Clear all</a>
    {/if}
  </div>
</section>

<section class="shell" style="padding-bottom: 72px">
  {#if data.dbDown}
    <article class="card">
      <h2>Search is unavailable</h2>
      <p>The database is not reachable right now.</p>
    </article>
  {:else if data.result.items.length === 0}
    <article class="card" style="max-width: 680px">
      <h2>No designs match</h2>
      <p>Try fewer filters or a different word.</p>
      {#if data.tags.length > 0}
        <p style="margin-top: 14px">
          Popular tags:
          {#each data.tags.slice(0, 8) as entry (entry.tag)}
            <a class="badge" href={`/search?tag=${encodeURIComponent(entry.tag)}`}>{entry.tag}</a>
          {/each}
        </p>
      {/if}
    </article>
  {:else}
    <p class="result-count">
      {data.result.fallback ? 'No exact matches; showing close titles. ' : ''}
      {data.result.total} design{data.result.total === 1 ? '' : 's'}
      {#if data.page > 1}· page {data.page}{/if}
    </p>
    <div class="design-grid">
      {#each data.result.items as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>

    {#if data.pages > 1}
      <nav class="pagination" aria-label="Pagination">
        {#if data.page > 1}
          <a class="button" href={pageHref(data.page - 1)}>Previous</a>
        {/if}
        <span>Page {data.page} of {data.pages}</span>
        {#if data.page < data.pages}
          <a class="button" href={pageHref(data.page + 1)}>Next</a>
        {/if}
      </nav>
    {/if}
  {/if}
</section>

<style>
  .search-form {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    max-width: 960px;
  }

  .search-form input,
  .search-form select {
    padding: 11px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }

  .search-form input {
    flex: 1;
    min-width: 240px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 16px;
    min-height: 26px;
  }

  .filters .clear {
    font-size: 13px;
    color: var(--muted);
  }

  .result-count {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 16px;
  }

  .design-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 18px;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 14px;
    justify-content: center;
    margin-top: 32px;
    color: var(--muted);
    font-size: 14px;
  }

  .sr-only {
    position: absolute;
    left: -9999px;
  }
</style>
