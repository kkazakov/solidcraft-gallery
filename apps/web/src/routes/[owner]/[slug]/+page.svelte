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

<section class="shell" style="padding: 40px 0 80px">
  <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; color: var(--muted); font-size: 13px">
    <a href={`/u/${data.project.ownerUsername}`}>{data.project.ownerUsername}</a>
    <span>/</span>
    <span class="mono">{data.project.slug}</span>
    {#if data.project.visibility !== 'public'}
      <span class="badge">{data.project.visibility}</span>
    {/if}
    {#if data.isOwner}
      <a href={`/dashboard/projects/${data.project.id}`}>Edit / publish</a>
    {/if}
  </div>

  <h1 style="letter-spacing: -0.035em; font-size: clamp(30px, 4.5vw, 48px); margin: 12px 0 10px">
    {data.project.title}
  </h1>
  {#if data.project.description}
    <p style="color: var(--muted); max-width: 760px; margin: 0 0 24px">{data.project.description}</p>
  {/if}

  {#if !data.latest}
    <article class="card" style="max-width: 720px">
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
              <img src={data.images.top} alt={`Top view of ${data.project.title}`} width="1200" height="900" />
            {/if}
            {#if data.images.front}
              <img src={data.images.front} alt={`Front view of ${data.project.title}`} width="1200" height="900" />
            {/if}
          </div>
        {/if}
      </div>

      <aside>
        <article class="card">
          <h2>Download</h2>
          <div style="display: grid; gap: 8px; margin-top: 12px">
            <a
              class="button primary"
              href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=solidcraft`}
            >
              .solidcraft
            </a>
            {#if data.formats.step}
              <a class="button" href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=step`}
                >STEP</a
              >
            {/if}
            {#if data.formats.stl}
              <a class="button" href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=stl`}>STL</a>
            {/if}
          </div>
          <p style="font-size: 12px; margin: 12px 0 0">Open the design with SolidCraft 0.18 or newer.</p>
          {#if data.project.repoUrl.startsWith('https://')}
            <p style="font-size: 12px; margin: 8px 0 0">
              <a href={data.project.repoUrl} target="_blank" rel="noopener noreferrer">Source repository</a>
            </p>
          {/if}
        </article>

        {#if data.metrics}
          <article class="card" style="margin-top: 16px">
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
          <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 16px">
            {#each data.project.tags as tag (tag)}
              <a class="badge" href={`/search?q=${encodeURIComponent(tag)}`}>{tag}</a>
            {/each}
          </div>
        {/if}
      </aside>
    </div>

    <section style="margin-top: 40px">
      <h2 style="letter-spacing: -0.02em">Versions</h2>
      <ul class="versions">
        {#each data.versions as version (version.id)}
          <li>
            <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
            <span class="badge">{version.status}</span>
            <span style="color: var(--muted)">{date.format(version.authoredAt)}</span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>

<style>
  .project-layout {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr);
    gap: 24px;
    align-items: start;
  }

  .hero-image {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    aspect-ratio: 4 / 3;
  }

  .hero-image img,
  .image-row img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .image-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
  }

  .image-row img {
    aspect-ratio: 4 / 3;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--panel);
  }

  .image-placeholder {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--muted);
  }

  .measurements {
    display: grid;
    gap: 10px;
    margin: 12px 0 0;
  }

  .measurements div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  .measurements dt {
    color: var(--muted);
  }

  .measurements dd {
    margin: 0;
    text-align: right;
  }

  .versions {
    list-style: none;
    padding: 0;
    margin: 12px 0 0;
    display: grid;
    gap: 8px;
  }

  .versions li {
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 8px;
    font-size: 13px;
  }

  @media (max-width: 860px) {
    .project-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
