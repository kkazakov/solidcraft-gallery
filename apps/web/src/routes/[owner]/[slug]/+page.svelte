<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t, enumLabel, formatDate, formatNumber } = getI18n();

  const numberOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
</script>

<svelte:head>
  <title>{t('project.title', { title: data.project.title })}</title>
  <meta
    name="description"
    content={data.project.description ||
      t('project.descriptionFallback', {
        title: data.project.title,
        owner: data.project.ownerUsername,
      })}
  />
  {#if data.project.visibility !== 'public'}
    <meta name="robots" content="noindex" />
  {/if}
  {#if data.latest?.tag}
    <link rel="canonical" href={`/${data.project.ownerUsername}/${data.project.slug}`} />
  {/if}
</svelte:head>

<section class="shell project-page">
  <nav class="breadcrumb" aria-label={t('common.breadcrumb')}>
    <a href={`/u/${data.project.ownerUsername}`}>{data.project.ownerUsername}</a>
    <span class="sep" aria-hidden="true">/</span>
    <span class="mono">{data.project.slug}</span>
    {#if data.project.visibility !== 'public'}
      <span class="badge">{enumLabel('visibility', data.project.visibility)}</span>
    {/if}
    {#if data.isOwner}
      <a href={`/dashboard/projects/${data.project.id}`}>{t('project.editPublish')}</a>
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
      <h2>{t('project.previewsTitle')}</h2>
      <p>
        {t('project.previewsBody')}
        {#if data.isOwner}
          {t('project.previewsOwner')}
        {/if}
      </p>
    </article>
  {:else}
    <div class="project-layout">
      <div>
        <div class="hero-image">
          {#if data.images.iso}
            <img
              src={data.images.iso}
              alt={t('project.altIso', { title: data.project.title })}
              width="1200"
              height="900"
            />
          {:else}
            <div class="image-placeholder">{t('project.noPreview')}</div>
          {/if}
        </div>
        {#if data.images.top || data.images.front}
          <div class="image-row">
            {#if data.images.top}
              <div class="image-cell">
                <img
                  src={data.images.top}
                  alt={t('project.altTop', { title: data.project.title })}
                  width="1200"
                  height="900"
                />
              </div>
            {/if}
            {#if data.images.front}
              <div class="image-cell">
                <img
                  src={data.images.front}
                  alt={t('project.altFront', { title: data.project.title })}
                  width="1200"
                  height="900"
                />
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="stack" aria-label={t('common.designDetails')}>
        <article class="card card-aside">
          <h2>{t('project.download')}</h2>
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
          <p class="card-note">{t('project.openWith')}</p>
          {#if data.project.repoUrl.startsWith('https://')}
            <p class="card-note">
              <a href={data.project.repoUrl} target="_blank" rel="noopener noreferrer">
                {t('project.sourceRepository')}
              </a>
            </p>
          {/if}
        </article>

        {#if data.metrics}
          <article class="card card-aside">
            <h2>{t('project.measurements')}</h2>
            <dl class="measurements">
              {#if data.metrics.bbox}
                <div>
                  <dt>{t('project.boundingBox')}</dt>
                  <dd>
                    {formatNumber(data.metrics.bbox[0] ?? 0, numberOptions)} × {formatNumber(
                      data.metrics.bbox[1] ?? 0,
                      numberOptions,
                    )} × {formatNumber(data.metrics.bbox[2] ?? 0, numberOptions)} mm
                  </dd>
                </div>
              {/if}
              <div>
                <dt>{t('project.bodies')}</dt>
                <dd>{data.metrics.bodies}</dd>
              </div>
              {#if data.metrics.volume > 0}
                <div>
                  <dt>{t('project.volume')}</dt>
                  <dd>{formatNumber(data.metrics.volume, numberOptions)} mm³</dd>
                </div>
              {/if}
              {#if data.metrics.mass > 0}
                <div>
                  <dt>{t('project.mass')}</dt>
                  <dd>{formatNumber(data.metrics.mass, numberOptions)} g</dd>
                </div>
              {/if}
              <div>
                <dt>{t('project.license')}</dt>
                <dd>{data.project.license ?? t('project.notSet')}</dd>
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
      <h2>{t('project.versions')}</h2>
      <ul class="version-list">
        {#each data.versions as version (version.id)}
          <li>
            <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
            <span class="badge">{enumLabel('status', version.status)}</span>
            {#if version.id === data.latest.id}
              <span class="badge ok">{t('project.live')}</span>
            {/if}
            <time class="date" datetime={version.authoredAt.toISOString()}>
              {formatDate(version.authoredAt)}
            </time>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</section>
