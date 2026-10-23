<script lang="ts">
  import { getI18n } from '../i18n/context';

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
  const { t, formatDate } = getI18n();
</script>

<article class="design-card">
  <a class="card-link" href={`/${project.ownerUsername}/${project.slug}`}>
    <div class="card-image">
      {#if project.coverKey}
        <img
          src={`/media/${project.coverKey}`}
          alt={t('card.renderAlt', { title: project.title })}
          width="1200"
          height="900"
          decoding="async"
        />
      {:else}
        <div class="card-placeholder" aria-hidden="true">{project.title.slice(0, 1).toUpperCase()}</div>
      {/if}
    </div>
    <div class="card-body">
      <h2 class="card-title">{project.title}</h2>
      <p class="card-owner">
        {project.ownerUsername}{#if project.publishedAt}
          · <time datetime={project.publishedAt.toISOString()}>
            {formatDate(project.publishedAt, { month: 'short', day: 'numeric', year: 'numeric' })}
          </time>
        {/if}
      </p>
      {#if project.description}
        <p class="card-description">{project.description}</p>
      {/if}
      {#if project.license || project.tags.length > 0}
        <div class="card-meta">
          {#if project.license}
            <span class="badge">{project.license}</span>
          {/if}
          {#each project.tags.slice(0, 2) as tag (tag)}
            <span class="badge">{tag}</span>
          {/each}
        </div>
      {/if}
    </div>
  </a>
</article>
