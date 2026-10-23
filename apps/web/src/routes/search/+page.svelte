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

<section class="shell page-head">
  <h1>Find a design</h1>

  <form method="GET" action="/search" class="search-form" role="search" aria-label="Search designs">
    {#if data.tag}
      <input type="hidden" name="tag" value={data.tag} />
    {/if}
    <label for="q" class="sr-only">Query</label>
    <input
      id="q"
      name="q"
      value={data.q}
      placeholder="Enclosure, bracket, M3 standoff…"
      autocomplete="off"
      spellcheck="false"
    />
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

<section class="shell section">
  {#if data.dbDown}
    <article class="card empty-card">
      <h2>Search is unavailable</h2>
      <p>The database is not reachable right now.</p>
    </article>
  {:else if data.result.items.length === 0}
    <article class="card empty-card">
      <h2>No designs match</h2>
      <p>Try fewer filters or a different word.</p>
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
      {data.result.fallback ? 'No exact matches; showing close titles. ' : ''}
      {data.result.total} design{data.result.total === 1 ? '' : 's'}{#if data.page > 1}· page {data.page}{/if}
    </p>
    <div class="design-grid">
      {#each data.result.items as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>

    {#if data.pages > 1}
      <nav class="pagination" aria-label="Pagination">
        {#if data.page > 1}
          <a class="button small" href={pageHref(data.page - 1)}>Previous</a>
        {/if}
        <span>Page {data.page} of {data.pages}</span>
        {#if data.page < data.pages}
          <a class="button small" href={pageHref(data.page + 1)}>Next</a>
        {/if}
      </nav>
    {/if}
  {/if}
</section>
