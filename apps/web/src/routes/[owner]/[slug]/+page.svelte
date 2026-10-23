<script lang="ts">
  let { data } = $props();
  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
  const number = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
</script>

<svelte:head>
  <title>{data.project.title} — SolidCraft Gallery</title>
  <meta
    name="description"
    content={data.project.description || `${data.project.title}, a SolidCraft design by ${data.project.ownerUsername}.`}
  />
  {#if data.project.visibility !== 'public'}
    <meta name="robots" content="noindex" />
  {/if}
  {#if data.latest?.tag}
    <link rel="canonical" href={`/${data.project.ownerUsername}/${data.project.slug}`} />
  {/if}
</svelte:head>

<section class="shell project-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href={`/u/${data.project.ownerUsername}`}>{data.project.ownerUsername}</a>
    <span class="sep" aria-hidden="true">/</span>
    <span class="mono">{data.project.slug}</span>
    {#if data.project.visibility !== 'public'}
      <span class="badge">{data.project.visibility}</span>
    {/if}
    {#if data.isOwner}
      <a href={`/dashboard/projects/${data.project.id}`}>Edit / publish</a>
    {/if}
  </nav>

  <header class="project-head">
    <h1>{data.project.title}</h1>
    {#if data.project.description}
      <p class="project-summary">{data.project.description}</p>
    {/if}
  </header>

  {#if !data.latest}
    <article class="card empty-card">
      <h2>Previews are being generated</h2>
      <p>
        The design is published, but the renderer has not produced its previews yet. Refresh in a moment. {#if data.isOwner}If
          it stays like this, open the project dashboard for the error.{/if}
      </p>
    </article>
  {:else}
    <div class="project-layout">
      <div>
        <div class="hero-image">
          {#if data.images.iso}
            <img src={data.images.iso} alt={`Isometric render of ${data.project.title}`} width="1200" height="900" />
          {:else}
            <div class="image-placeholder">No preview</div>
          {/if}
        </div>
        {#if data.images.top || data.images.front}
          <div class="image-row">
            {#if data.images.top}
              <div class="image-cell">
                <img src={data.images.top} alt={`Top view of ${data.project.title}`} width="1200" height="900" />
              </div>
            {/if}
            {#if data.images.front}
              <div class="image-cell">
                <img src={data.images.front} alt={`Front view of ${data.project.title}`} width="1200" height="900" />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="stack" aria-label="Design details">
        <article class="card card-aside">
          <h2>Download</h2>
          <div class="download-list">
            <a
              class="button primary"
              href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=solidcraft`}
            >
              .solidcraft
            </a>
            {#if data.formats.step}
              <a class="button" href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=step`}>
                STEP
              </a>
            {/if}
            {#if data.formats.stl}
              <a class="button" href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=stl`}>
                STL
              </a>
            {/if}
          </div>
          <p class="card-note">Open the design with SolidCraft 0.18 or newer.</p>
          {#if data.project.repoUrl.startsWith('https://')}
            <p class="card-note">
              <a href={data.project.repoUrl} target="_blank" rel="noopener noreferrer">Source repository</a>
            </p>
          {/if}
        </article>

        {#if data.metrics}
          <article class="card card-aside">
            <h2>Measurements</h2>
            <dl class="measurements">
              {#if data.metrics.bbox}
                <div>
                  <dt>Bounding box</dt>
                  <dd>
                    {number.format(data.metrics.bbox[0] ?? 0)} × {number.format(data.metrics.bbox[1] ?? 0)} × {number.format(
                      data.metrics.bbox[2] ?? 0,
                    )} mm
                  </dd>
                </div>
              {/if}
              <div>
                <dt>Bodies</dt>
                <dd>{data.metrics.bodies}</dd>
              </div>
              {#if data.metrics.volume > 0}
                <div>
                  <dt>Volume</dt>
                  <dd>{number.format(data.metrics.volume)} mm³</dd>
                </div>
              {/if}
              {#if data.metrics.mass > 0}
                <div>
                  <dt>Mass</dt>
                  <dd>{number.format(data.metrics.mass)} g</dd>
                </div>
              {/if}
              <div>
                <dt>License</dt>
                <dd>{data.project.license ?? 'Not set'}</dd>
              </div>
            </dl>
          </article>
        {/if}

        {#if data.project.tags.length > 0}
          <div class="tag-row">
            {#each data.project.tags as tag (tag)}
              <a class="badge" href={`/search?q=${encodeURIComponent(tag)}`}>{tag}</a>
            {/each}
          </div>
        {/if}
      </aside>
    </div>

    <section class="versions-section">
      <h2>Versions</h2>
      <ul class="version-list">
        {#each data.versions as version (version.id)}
          <li>
            <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
            <span class="badge">{version.status}</span>
            <time class="date" datetime={version.authoredAt.toISOString()}>{date.format(version.authoredAt)}</time>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>
