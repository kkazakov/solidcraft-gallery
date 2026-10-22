<script lang="ts">
  import DesignCard from '../lib/components/DesignCard.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>SolidCraft Gallery — designs, versions and downloads</title>
  <meta
    name="description"
    content="A public, git-backed gallery for SolidCraft designs. Preview, search, download and share parametric CAD."
  />
</svelte:head>

<section class="hero shell">
  <span class="eyebrow">
    <span class="dot"></span>
    {data.total > 0 ? `${data.total} public design${data.total === 1 ? '' : 's'}` : 'Early preview'} · v{data.version}
  </span>
  <h1>Parametric CAD,<br />published like code.</h1>
  <p class="lede">
    A public gallery for SolidCraft designs. Every project is a git repository with a real
    <code>.solidcraft</code> file, rendered previews, measurements and searchable metadata. Private work stays private until
    you publish it.
  </p>

  <form method="GET" action="/search" class="hero-search">
    <label for="q" class="sr-only">Search designs</label>
    <input id="q" name="q" placeholder="Enclosure, bracket, M3 standoff…" autocomplete="off" />
    <button class="button primary" type="submit">Search</button>
  </form>

  <div class="actions">
    <a class="button" href="/auth/login">Publish a design</a>
    <a class="button" href="/about">How it works</a>
  </div>
</section>

{#if data.dbDown}
  <section class="shell" style="padding-bottom: 64px">
    <article class="card">
      <h2>The gallery database is unavailable</h2>
      <p>The site is up, but projects cannot be listed right now. Please try again shortly.</p>
    </article>
  </section>
{:else if data.total === 0}
  <section class="shell" style="padding-bottom: 72px">
    <article class="card" style="max-width: 720px">
      <h2>No public designs yet</h2>
      <p>
        The first projects are on their way. Sign in, create a hosted project, publish a
        <code>.solidcraft</code> file and set it public once its preview is ready.
      </p>
      <p style="margin-top: 14px"><a class="button primary" href="/auth/login">Start a project</a></p>
    </article>
  </section>
{:else}
  {#if data.featured.length > 0}
    <section class="shell">
      <div class="section-head">
        <h2>Featured</h2>
        <a href="/search">Browse all</a>
      </div>
      <div class="design-grid">
        {#each data.featured as project (project.id)}
          <DesignCard {project} />
        {/each}
      </div>
    </section>
  {/if}

  <section class="shell">
    <div class="section-head">
      <h2>Recent</h2>
      <a href="/search">Browse all</a>
    </div>
    <div class="design-grid">
      {#each data.recent as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>
  </section>

  {#if data.tags.length > 0}
    <section class="shell" style="padding-bottom: 72px">
      <div class="section-head">
        <h2>Tags</h2>
      </div>
      <div class="tag-cloud">
        {#each data.tags as tag (tag.tag)}
          <a class="badge" href={`/search?tag=${encodeURIComponent(tag.tag)}`}>
            {tag.tag} <span style="color: var(--muted)">{tag.count}</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
{/if}

<style>
  .hero-search {
    display: flex;
    gap: 10px;
    max-width: 640px;
    margin: 0 0 18px;
  }

  .hero-search input {
    flex: 1;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
    color: var(--text);
    font: inherit;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0 14px;
  }

  .section-head h2 {
    margin: 0;
    letter-spacing: -0.02em;
    font-size: 22px;
  }

  .section-head a {
    color: var(--muted);
    font-size: 14px;
  }

  .design-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 18px;
    padding-bottom: 40px;
  }

  .tag-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .sr-only {
    position: absolute;
    left: -9999px;
  }
</style>
