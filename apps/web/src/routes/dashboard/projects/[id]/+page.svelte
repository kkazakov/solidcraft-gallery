<script lang="ts">
  import LanguageSwitcher from '../../../../lib/components/LanguageSwitcher.svelte';
  import { getI18n } from '../../../../lib/i18n/context';

  let { data, form } = $props();
  const { t, enumLabel, formatDate } = getI18n();

  const selectedVisibility = $derived(form?.details ? form.visibility : data.project.visibility);
  const selectedLicense = $derived(
    form?.details ? (form.visibility === 'private' ? '' : (form.license ?? '')) : (data.project.license ?? ''),
  );
</script>

<svelte:head>
  <title>{t('manage.title', { title: data.project.title })}</title>
</svelte:head>

<section class="shell dashboard-page">
  <nav class="breadcrumb" aria-label={t('common.breadcrumb')}>
    <a href="/dashboard">{t('common.dashboard')}</a>
    <span class="sep" aria-hidden="true">/</span>
    <span class="mono">{data.project.slug}</span>
  </nav>

  <div class="dashboard-head">
    <div>
      <h1>{data.project.title}</h1>
      <div class="badge-row">
        <span class="badge">{enumLabel('visibility', data.project.visibility)}</span>
        <span class="badge">{enumLabel('status', data.project.status)}</span>
        <span class="badge">{enumLabel('provider', data.project.repoProvider)}</span>
        {#if data.project.status === 'ready'}
          <a href={`/${data.project.ownerUsername}/${data.project.slug}`}>{t('manage.viewPage')}</a>
        {/if}
      </div>
    </div>
    <div class="page-actions">
      <LanguageSwitcher />
    </div>
  </div>

  {#if data.created}
    <p class="notice notice-ok">{t('manage.noticeCreated')}</p>
  {:else if data.saved === 'details'}
    <p class="notice notice-ok">{t('manage.noticeDetails')}</p>
  {:else if data.saved === 'version'}
    <p class="notice notice-ok">{t('manage.noticeVersion')}</p>
  {:else if data.saved === 'active'}
    <p class="notice notice-ok">{t('manage.noticeActive')}</p>
  {/if}

  <div class="edit-grid">
    <div class="stack">
      <form method="POST" action="?/details" class="card form-page" data-visibility-form>
        <h2>{t('manage.detailsHeading')}</h2>
        <p>{t('manage.detailsIntro')}</p>

        <div class="form-stack">
          <label class="field" for="title">
            <span>{t('manage.titleLabel')}</span>
            <input
              id="title"
              name="title"
              value={form?.details ? form.title : data.project.title}
              required
              maxlength="120"
            />
          </label>

          <label class="field" for="description">
            <span>{t('manage.descriptionLabel')}</span>
            <textarea id="description" name="description" rows="4" maxlength="2000"
              >{form?.details ? form.description : data.project.description}</textarea
            >
          </label>

          <div class="form-split">
            <label class="field" for="visibility">
              <span>{t('manage.visibility')}</span>
              <select id="visibility" name="visibility" data-visibility-select>
                <option value="private" selected={selectedVisibility === 'private'}>
                  {t('visibility.private')}
                </option>
                <option value="unlisted" selected={selectedVisibility === 'unlisted'}>
                  {t('visibility.unlisted')}
                </option>
                <option value="public" selected={selectedVisibility === 'public'}>
                  {t('visibility.public')}
                </option>
              </select>
              <span class="field-hint">{t('manage.visibilityHint')}</span>
            </label>

            <label class="field" for="license" data-license-field>
              <span>{t('manage.license')}</span>
              <select id="license" name="license" data-license-select>
                <option value="">{t('manage.noLicense')}</option>
                {#each data.licenses as license (license.id)}
                  <option value={license.id} selected={selectedLicense === license.id}>{license.name}</option>
                {/each}
              </select>
              <span class="field-hint">{t('manage.licenseHint')}</span>
            </label>
          </div>
        </div>

        {#if form?.details && form.message}
          <p class="form-message error">{form.message}</p>
        {/if}

        <div class="form-actions">
          <button class="button primary" type="submit">{t('manage.saveChanges')}</button>
        </div>
      </form>

      {#if data.project.repoProvider !== 'github'}
        <form method="POST" action="?/publish" enctype="multipart/form-data" class="card form-page">
          <h2>{t('manage.uploadHeading')}</h2>
          <p>{t('manage.uploadIntro')}</p>

          <div class="form-stack">
            <div class="field">
              <span>{t('newProject.designFile')}</span>
              <label class="upload-box" for="design">
                <span class="upload-title">{t('newProject.chooseFile')}</span>
                <span class="field-hint">{t('newProject.designHint')}</span>
                <input
                  id="design"
                  name="design"
                  type="file"
                  accept=".solidcraft,application/zip,application/json"
                  required
                />
              </label>
            </div>

            <label class="field" for="version">
              <span>{t('newProject.version')}</span>
              <input
                id="version"
                name="version"
                value={form?.publish ? (form.version ?? '') : ''}
                maxlength="64"
                placeholder="v1.1.0"
                autocapitalize="off"
                spellcheck="false"
              />
              <span class="field-hint">{t('newProject.versionHint')}</span>
            </label>
          </div>

          {#if form?.publish && form.message}
            <p class="form-message error">{form.message}</p>
          {/if}

          <div class="form-actions">
            <button class="button primary" type="submit">{t('manage.publishVersion')}</button>
          </div>
        </form>
      {:else}
        <article class="card">
          <h2>{t('manage.sourceHeading')}</h2>
          <p>{t('manage.sourceBody')}</p>
          <p>
            <a class="mono wrap-anywhere" href={data.project.repoUrl} target="_blank" rel="noopener noreferrer"
              >{data.project.repoUrl}</a
            >
          </p>
          <form method="POST" action="?/sync">
            <button class="button primary" type="submit">{t('manage.syncNow')}</button>
          </form>
          {#if form?.sync}
            <p class="form-message" class:ok={form.ok} class:error={!form.ok}>{form.message}</p>
          {/if}
        </article>
      {/if}
    </div>

    <aside class="card">
      <h2>{t('manage.versions')}</h2>
      {#if data.versions.length === 0}
        <p>{t('manage.noVersions')}</p>
      {:else}
        {#if form?.activate && form.message}
          <p class="form-message error">{form.message}</p>
        {/if}
        <ul class="version-list">
          {#each data.versions as version (version.id)}
            <li>
              <div class="version-main">
                <div class="version-line">
                  <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
                  <span class:ok={version.status === 'ready'} class:warn={version.status === 'failed'} class="badge">
                    {enumLabel('status', version.status)}
                  </span>
                  {#if data.activeVersionId === version.id}
                    <span class="badge ok">{t('manage.active')}</span>
                  {/if}
                </div>
                <time class="version-date" datetime={version.authoredAt.toISOString()}>
                  {formatDate(version.authoredAt)}
                </time>
                {#if version.status === 'failed' && version.errorDetail}
                  <p class="form-message error">{version.errorDetail}</p>
                {/if}
              </div>
              {#if version.status === 'ready' && data.activeVersionId !== version.id}
                <form method="POST" action="?/activate" class="version-action">
                  <input type="hidden" name="versionId" value={version.id} />
                  <button class="button small" type="submit">{t('manage.setActive')}</button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</section>
