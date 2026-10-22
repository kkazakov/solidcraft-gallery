<script lang="ts">
  interface CardProject {
    id: string;
    slug: string;
    ownerUsername: string;
    title: string;
    description: string;
    license: string | null;
    tags: string[];
    publishedAt: Date | null;
    coverKey: string | null;
  }

  let { project }: { project: CardProject } = $props();
  const date = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' });
</script>

<article class="design-card">
  <a class="card-link" href={`/${project.ownerUsername}/${project.slug}`}>
    <div class="card-image">
      {#if project.coverKey}
        <img
          src={`/media/${project.coverKey}`}
          alt={`Isometric render of ${project.title}`}
          width="1200"
          height="900"
          decoding="async"
        />
      {:else}
        <div class="card-placeholder" aria-hidden="true">{project.title.slice(0, 1).toUpperCase()}</div>
      {/if}
    </div>
    <div class="card-body">
      <h2>{project.title}</h2>
      <p class="owner">{project.ownerUsername}{project.publishedAt ? ` · ${date.format(project.publishedAt)}` : ''}</p>
      {#if project.description}
        <p class="description">{project.description}</p>
      {/if}
      <div class="meta">
        {#if project.license}
          <span class="badge">{project.license}</span>
        {/if}
        {#each project.tags.slice(0, 2) as tag (tag)}
          <span class="badge">{tag}</span>
        {/each}
      </div>
    </div>
  </a>
</article>

<style>
  .design-card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition:
      border-color 120ms ease,
      transform 120ms ease;
  }

  .design-card:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    transform: translateY(-1px);
  }

  .card-link {
    display: block;
    text-decoration: none;
    color: inherit;
    height: 100%;
  }

  .card-image {
    aspect-ratio: 4 / 3;
    background: var(--panel-2);
    overflow: hidden;
  }

  .card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .card-placeholder {
    display: grid;
    place-items: center;
    height: 100%;
    font-size: 44px;
    font-weight: 800;
    color: var(--muted);
    background: linear-gradient(135deg, var(--panel-2), var(--panel));
  }

  .card-body {
    padding: 14px 16px 16px;
  }

  h2 {
    font-size: 16px;
    letter-spacing: -0.01em;
    margin: 0;
    line-height: 1.3;
  }

  .owner {
    color: var(--muted);
    font-size: 12px;
    margin: 4px 0 0;
  }

  .description {
    color: var(--muted);
    font-size: 13px;
    margin: 8px 0 0;
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }
</style>
