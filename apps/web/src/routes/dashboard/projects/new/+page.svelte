<script lang="ts">
  import LanguageSwitcher from '../../../../lib/components/LanguageSwitcher.svelte';
  import { getI18n } from '../../../../lib/i18n/context';

  let { data, form } = $props();
  const { t } = getI18n();

  const selectedVisibility = $derived(form?.visibility ?? 'private');
</script>

<svelte:head>
  <title>{t('newProject.title')}</title>
</svelte:head>

<section class="shell dashboard-page">
  <nav class="breadcrumb" aria-label={t('common.breadcrumb')}>
    <a href="/dashboard">{t('common.dashboard')}</a>
    <span class="sep" aria-hidden="true">/</span>
    <span>{t('newProject.breadcrumb')}</span>
  </nav>

  <div class="dashboard-head">
    <div>
      <h1>{t('newProject.heading')}</h1>
      <p>{t('newProject.intro')}</p>
    </div>
    <div class="page-actions">
      <LanguageSwitcher />
    </div>
  </div>

  <form method="POST" action="?/create" enctype="multipart/form-data" class="card form-page" data-visibility-form>
    {#if form?.message && !form?.connect}
      <p class="notice">
        {form.message}
        {#if form.projectId}
          <a href={`/dashboard/projects/${form.projectId}`}>{t('common.openProject')}</a>
        {/if}
      </p>
    {/if}

    <div class="form-stack">
      <label class="field" for="title">
        <span>{t('newProject.titleLabel')}</span>
        <input
          id="title"
          name="title"
          value={form?.title ?? ''}
          required
          maxlength="120"
          placeholder={t('newProject.titlePlaceholder')}
        />
      </label>

      <label class="field" for="description">
        <span>{t('newProject.descriptionLabel')}</span>
        <textarea
          id="description"
          name="description"
          rows="3"
          maxlength="2000"
          placeholder={t('newProject.descriptionPlaceholder')}>{form?.description ?? ''}</textarea
        >
      </label>

      <div class="field">
        <span>{t('newProject.designFile')}</span>
        <label class="upload-box" for="design">
          <span class="upload-title">{t('newProject.chooseFile')}</span>
          <span class="field-hint">{t('newProject.designHint')}</span>
          <input id="design" name="design" type="file" accept=".solidcraft,application/zip,application/json" required />
        </label>
      </div>

      <div class="form-split">
        <label class="field" for="version">
          <span>{t('newProject.version')}</span>
          <input
            id="version"
            name="version"
            value={form?.version ?? 'v1.0.0'}
            maxlength="64"
            placeholder="v1.0.0"
            autocapitalize="off"
            spellcheck="false"
          />
          <span class="field-hint">{t('newProject.versionHint')}</span>
        </label>

        <label class="field" for="visibility">
          <span>{t('newProject.visibility')}</span>
          <select id="visibility" name="visibility" data-visibility-select>
            <option value="private" selected={selectedVisibility === 'private'}>{t('newProject.private')}</option>
            <option value="public" selected={selectedVisibility === 'public'}>{t('newProject.public')}</option>
          </select>
          <span class="field-hint">{t('newProject.visibilityHint')}</span>
        </label>
      </div>

      <label class="field" for="license" data-license-field>
        <span>{t('newProject.license')}</span>
        <select id="license" name="license" data-license-select>
          <option value="">{t('newProject.chooseLicense')}</option>
          {#each data.licenses as license (license.id)}
            <option value={license.id} selected={form?.license === license.id}>{license.name}</option>
          {/each}
        </select>
        <span class="field-hint">{t('newProject.licenseHint')}</span>
      </label>
    </div>

    <div class="form-actions">
      <button class="button primary" type="submit">{t('newProject.create')}</button>
      <a class="button" href="/dashboard">{t('common.cancel')}</a>
    </div>
  </form>

  <details class="card connect-panel" open={Boolean(form?.connect)}>
    <summary>{t('newProject.importSummary')}</summary>
    <p>
      {t('newProject.importBody.before')} <code>.solidcraft</code>
      {t('newProject.importBody.middle')}
      <code>project.json</code>
      {t('newProject.importBody.after')}
    </p>
    <form method="POST" action="?/connect" class="form-row">
      <label class="field">
        <span class="sr-only">{t('newProject.repositoryUrl')}</span>
        <input
          name="url"
          type="url"
          required
          placeholder="https://github.com/jane/pi-case"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <button class="button primary" type="submit">{t('newProject.importRepository')}</button>
    </form>
    {#if form?.connect}
      <p class="form-message error">{form.message}</p>
    {/if}
  </details>
</section>
