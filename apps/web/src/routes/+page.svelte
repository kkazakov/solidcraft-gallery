<script lang="ts">
  import DesignCard from '../lib/components/DesignCard.svelte';

  let { data } = $props();

  const publishHref = $derived(
    data.viewer ? '/dashboard/projects/new' : '/auth/login?redirect=%2Fdashboard%2Fprojects%2Fnew',
  );
</script>

<svelte:head>
  <title>SolidCraft Gallery — designs, versions and downloads</title>
  <meta
    name="description"
    content="A public, git-backed gallery for SolidCraft designs. Preview, search, download and share parametric CAD."
  />
</svelte:head>

<section class="hero shell">
  <p class="meta-line">
    <span class="dot"></span>
    <span>{data.total > 0 ? `${data.total} public design${data.total === 1 ? '' : 's'}` : 'Early preview'}</span>
    <span class="sep" aria-hidden="true">·</span>
    <span>v{data.version}</span>
  </p>
  <h1>Parametric CAD,<br />published like code.</h1>
  <p class="lede">
    A public gallery for SolidCraft designs. Every project is a git repository with a real
    <code>.solidcraft</code> file, rendered previews, measurements and searchable metadata. Private work stays private until
    you publish it.
  </p>

  <form method="GET" action="/search" class="hero-search">
    <label for="q" class="sr-only">Search designs</label>
    <input id="q" name="q" placeholder="Enclosure, bracket, M3 standoff…" autocomplete="off" spellcheck="false" />
    <button class="button primary" type="submit">Search</button>
  </form>

  <div class="actions">
    <a class="button" href={publishHref}>Publish a design</a>
    <a class="quiet-link" href="/about">How it works</a>
  </div>
</section>

{#if data.dbDown}
  <section class="shell section">
    <article class="card empty-card">
      <h2>The gallery database is unavailable</h2>
      <p>The site is up, but projects cannot be listed right now. Please try again shortly.</p>
    </article>
  </section>
{:else if data.total === 0}
  <section class="shell section">
    <article class="card empty-card">
      <h2>No public designs yet</h2>
      <p>
        The first projects are on their way. Sign in, create a hosted project, publish a
        <code>.solidcraft</code> file and set it public once its preview is ready.
      </p>
      <p class="form-message"><a class="button primary" href={publishHref}>Start a project</a></p>
    </article>
  </section>
{:else}
  {#if data.featured.length > 0}
    <section class="shell section">
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

  <section class="shell section">
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
    <section class="shell section">
      <div class="section-head">
        <h2>Tags</h2>
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
