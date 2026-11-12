<script lang="ts">
  import { tick } from 'svelte';
  import { linkifyDescription } from '../../../lib/description-links';
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t, enumLabel, formatDate, formatNumber } = getI18n();

  const numberOptions: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
  const descriptionSegments = $derived(data.project.description ? linkifyDescription(data.project.description) : []);

  type ShotKind = 'iso' | 'top' | 'front' | 'bottom';
  interface Shot {
    kind: ShotKind;
    src: string;
    label: string;
    alt: string;
  }

  const shots = $derived(
    (
      [
        {
          kind: 'iso',
          src: data.images.iso,
          label: t('project.viewIso'),
          alt: t('project.altIso', { title: data.project.title }),
        },
        {
          kind: 'top',
          src: data.images.top,
          label: t('project.viewTop'),
          alt: t('project.altTop', { title: data.project.title }),
        },
        {
          kind: 'front',
          src: data.images.front,
          label: t('project.viewFront'),
          alt: t('project.altFront', { title: data.project.title }),
        },
        {
          kind: 'bottom',
          src: data.images.bottom,
          label: t('project.viewBottom'),
          alt: t('project.altBottom', { title: data.project.title }),
        },
      ] as { kind: ShotKind; src: string | undefined; label: string; alt: string }[]
    ).filter((shot): shot is Shot => Boolean(shot.src)),
  );

  let dialog = $state<HTMLDialogElement | null>(null);
  let activeShot = $state<Shot | null>(null);

  function openShot(shot: Shot): void {
    activeShot = shot;
    dialog?.showModal();
  }

  function closeShot(): void {
    dialog?.close();
  }

  function onDialogClick(event: MouseEvent): void {
    if (event.target === dialog) closeShot();
  }

  /** Cap for the interactive viewer; very large meshes stay download-only. */
  const MODEL_VIEW_LIMIT = 64 * 1024 * 1024;

  let viewerDialog = $state<HTMLDialogElement | null>(null);
  let viewerCanvas = $state<HTMLCanvasElement | null>(null);
  let viewerOpen = $state(false);
  let viewerLoading = $state(false);
  let viewerError = $state<string | null>(null);
  let viewer = $state.raw<{ reset(): void; dispose(): void } | null>(null);
  let viewerRun = 0;

  const canView3d = $derived(Boolean(data.model) && (data.model?.bytes ?? 0) <= MODEL_VIEW_LIMIT);

  async function openViewer(): Promise<void> {
    if (!data.model || !canView3d) return;
    viewerError = null;
    viewerLoading = true;
    viewerOpen = true;
    viewerDialog?.showModal();
    const run = ++viewerRun;
    await tick();
    const canvas = viewerCanvas;
    if (!canvas) return;
    try {
      const { mountStlViewer } = await import('../../../lib/three-viewer');
      if (run !== viewerRun) return;
      viewer = await mountStlViewer(canvas, data.model.url);
      if (run !== viewerRun) {
        viewer.dispose();
        viewer = null;
        return;
      }
    } catch (error) {
      if (run !== viewerRun) return;
      viewerError = error instanceof Error ? error.message : String(error);
    } finally {
      if (run === viewerRun) viewerLoading = false;
    }
  }

  function closeViewer(): void {
    viewerRun += 1;
    viewer?.dispose();
    viewer = null;
    viewerLoading = false;
    viewerError = null;
    viewerOpen = false;
    viewerDialog?.close();
  }

  function resetViewer(): void {
    viewer?.reset();
  }

  function onViewerClick(event: MouseEvent): void {
    if (event.target === viewerDialog && !viewerLoading) closeViewer();
  }
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
    {#if descriptionSegments.length > 0}
      <p class="project-summary">
        {#each descriptionSegments as segment, index (index)}
          {#if segment.type === 'link'}
            <a class="wrap-anywhere" href={segment.href} target="_blank" rel="noopener noreferrer">{segment.text}</a>
          {:else}{segment.text}{/if}
        {/each}
      </p>
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
        {#if shots.length > 0}
          <ul class="shot-strip" aria-label={t('project.views')}>
            {#each shots as shot (shot.kind)}
              <li>
                <button
                  type="button"
                  class="shot-button"
                  onclick={() => openShot(shot)}
                  aria-label={t('project.openView', { view: shot.label })}
                >
                  <img src={shot.src} alt={shot.alt} width="1200" height="900" />
                  <span>{shot.label}</span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        {#if data.model}
          <div class="model-action">
            {#if canView3d}
              <button type="button" class="button" onclick={openViewer}>{t('project.view3d')}</button>
              <span class="field-hint">{t('project.view3dHint')}</span>
            {:else}
              <span class="field-hint">{t('project.view3dTooLarge')}</span>
            {/if}
          </div>
        {/if}
      </div>

      <aside class="stack" aria-label={t('common.designDetails')}>
        <article class="card card-aside">
          <h2>{t('project.download')}</h2>
          <div class="download-list">
            <a class="button primary" href={`/${data.project.ownerUsername}/${data.project.slug}/download?format=sc`}>
              .sc
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

    <dialog
      bind:this={dialog}
      class="shot-dialog"
      aria-label={t('project.views')}
      onclose={() => (activeShot = null)}
      onclick={onDialogClick}
    >
      {#if activeShot}
        <div class="shot-dialog-inner">
          <button type="button" class="shot-close" onclick={closeShot} aria-label={t('project.closeView')}> × </button>
          <img src={activeShot.src} alt={activeShot.alt} width="1200" height="900" />
          <p>{t('project.previewTitle', { title: data.project.title, view: activeShot.label })}</p>
        </div>
      {/if}
    </dialog>

    <dialog
      bind:this={viewerDialog}
      class="viewer-dialog"
      aria-label={t('project.view3d')}
      onclose={closeViewer}
      onclick={onViewerClick}
    >
      <div class="viewer-head">
        <h2>{t('project.view3d')}</h2>
        <div class="viewer-actions">
          <button type="button" class="button small" onclick={resetViewer} disabled={!viewer}>
            {t('project.view3dReset')}
          </button>
          <button type="button" class="button small" onclick={closeViewer}>{t('project.closeView')}</button>
        </div>
      </div>
      <div class="viewer-stage">
        <canvas bind:this={viewerCanvas} class="viewer-canvas"></canvas>
        {#if viewerLoading}
          <p class="viewer-overlay">{t('project.view3dLoading')}</p>
        {:else if viewerError}
          <p class="viewer-overlay error">{t('project.view3dError')}</p>
        {:else if viewer}
          <p class="viewer-hint">{t('project.view3dControls')}</p>
        {/if}
      </div>
    </dialog>

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

<style>
  .shot-strip {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 10px;
    margin: 10px 0 0;
    padding: 0;
    list-style: none;
  }

  .shot-button {
    display: grid;
    width: 100%;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--panel);
    color: var(--text);
    font: inherit;
    text-align: left;
    cursor: zoom-in;
  }

  .shot-button:hover {
    border-color: var(--border-strong);
  }

  .shot-button:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .shot-button img {
    display: block;
    width: 100%;
    height: auto;
    aspect-ratio: 4 / 3;
    object-fit: cover;
    background: var(--panel-2);
  }

  .shot-button span {
    padding: 7px 9px;
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 600;
  }

  .shot-dialog {
    width: min(1200px, 94vw);
    max-height: 94vh;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
  }

  .shot-dialog::backdrop {
    background: rgb(0 0 0 / 0.72);
  }

  .shot-dialog-inner {
    position: relative;
    display: grid;
  }

  .shot-dialog img {
    display: block;
    width: 100%;
    height: auto;
    max-height: calc(94vh - 44px);
    object-fit: contain;
    background: var(--panel-2);
  }

  .shot-dialog p {
    margin: 0;
    padding: 10px 14px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 12.5px;
  }

  .shot-close {
    position: absolute;
    top: 10px;
    right: 10px;
    z-index: 1;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: color-mix(in srgb, var(--panel) 88%, transparent);
    color: var(--text);
    font: inherit;
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
  }

  .shot-close:hover {
    background: var(--panel);
    border-color: var(--text);
  }

  @media (width <= 640px) {
    .shot-strip {
      gap: 6px;
    }

    .shot-button span {
      padding: 6px;
      font-size: 10.5px;
    }
  }

  .model-action {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    margin-top: 12px;
  }

  .model-action .field-hint {
    margin: 0;
  }

  .viewer-dialog {
    width: min(1100px, 96vw);
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--panel);
    color: var(--text);
  }

  .viewer-dialog::backdrop {
    background: rgb(0 0 0 / 0.78);
  }

  .viewer-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .viewer-head h2 {
    margin: 0;
    font-size: 15px;
  }

  .viewer-actions {
    display: flex;
    gap: 6px;
  }

  .viewer-stage {
    position: relative;
    height: min(68vh, 640px);
    background: var(--panel-2);
  }

  .viewer-canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
  }

  .viewer-canvas:active {
    cursor: grabbing;
  }

  .viewer-overlay,
  .viewer-hint {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
    text-align: center;
    pointer-events: none;
  }

  .viewer-overlay {
    top: 50%;
    transform: translate(-50%, -50%);
  }

  .viewer-overlay.error {
    color: var(--warn);
  }

  .viewer-hint {
    bottom: 10px;
  }

  @media (width <= 640px) {
    .viewer-stage {
      height: 60vh;
    }
  }
</style>
