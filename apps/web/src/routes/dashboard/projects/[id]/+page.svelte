<script lang="ts">
  let { data, form } = $props();

  const date = new Intl.DateTimeFormat('en', { dateStyle: 'medium' });
  const selectedVisibility = $derived(form?.details ? form.visibility : data.project.visibility);
  const selectedLicense = $derived(
    form?.details ? (form.visibility === 'private' ? '' : (form.license ?? '')) : (data.project.license ?? ''),
  );
</script>

<svelte:head>
  <title>{data.project.title} — Project — SolidCraft Gallery</title>
</svelte:head>

<section class="shell dashboard-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/dashboard">Dashboard</a>
    <span class="sep" aria-hidden="true">/</span>
    <span class="mono">{data.project.slug}</span>
  </nav>

  <div class="dashboard-head">
    <div>
      <h1>{data.project.title}</h1>
      <div class="badge-row">
        <span class="badge">{data.project.visibility}</span>
        <span class="badge">{data.project.status}</span>
        <span class="badge">{data.project.repoProvider}</span>
        {#if data.project.status === 'ready'}
          <a href={`/${data.project.ownerUsername}/${data.project.slug}`}>View page</a>
        {/if}
      </div>
    </div>
  </div>

  {#if data.created}
    <p class="notice notice-ok">Project created. The preview appears as soon as the render finishes.</p>
  {:else if data.saved === 'details'}
    <p class="notice notice-ok">Changes saved.</p>
  {:else if data.saved === 'version'}
    <p class="notice notice-ok">Version published. It becomes active when rendering finishes.</p>
  {:else if data.saved === 'active'}
    <p class="notice notice-ok">Active version updated.</p>
  {/if}

  <div class="edit-grid">
    <div class="stack">
      <form method="POST" action="?/details" class="card form-page" data-visibility-form>
        <h2>Project details</h2>
        <p>Rename the project, write its description, and choose who can see it.</p>

        <div class="form-stack">
          <label class="field" for="title">
            <span>Title</span>
            <input
              id="title"
              name="title"
              value={form?.details ? form.title : data.project.title}
              required
              maxlength="120"
            />
          </label>

          <label class="field" for="description">
            <span>Description</span>
            <textarea id="description" name="description" rows="4" maxlength="2000"
              >{form?.details ? form.description : data.project.description}</textarea
            >
          </label>

          <div class="form-split">
            <label class="field" for="visibility">
              <span>Visibility</span>
              <select id="visibility" name="visibility" data-visibility-select>
                <option value="private" selected={selectedVisibility === 'private'}>Private</option>
                <option value="unlisted" selected={selectedVisibility === 'unlisted'}>Unlisted</option>
                <option value="public" selected={selectedVisibility === 'public'}>Public</option>
              </select>
              <span class="field-hint">Public projects appear in search and the gallery.</span>
            </label>

            <label class="field" for="license" data-license-field>
              <span>License</span>
              <select id="license" name="license" data-license-select>
                <option value="">No license</option>
                {#each data.licenses as license (license.id)}
                  <option value={license.id} selected={selectedLicense === license.id}>{license.name}</option>
                {/each}
              </select>
              <span class="field-hint">Required when the project is public.</span>
            </label>
          </div>
        </div>

        {#if form?.details && form.message}
          <p class="form-message error">{form.message}</p>
        {/if}

        <div class="form-actions">
          <button class="button primary" type="submit">Save changes</button>
        </div>
      </form>

      {#if data.project.repoProvider !== 'github'}
        <form method="POST" action="?/publish" enctype="multipart/form-data" class="card form-page">
          <h2>Upload a new version</h2>
          <p>The new version becomes active when its preview is ready.</p>

          <div class="form-stack">
            <div class="field">
              <span>Design file</span>
              <label class="upload-box" for="design">
                <span class="upload-title">Choose a .solidcraft file</span>
                <span class="field-hint">A SolidCraft container or JSON file, up to 25 MB.</span>
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
              <span>Version</span>
              <input
                id="version"
                name="version"
                value={form?.publish ? (form.version ?? '') : ''}
                maxlength="64"
                placeholder="v1.1.0"
                autocapitalize="off"
                spellcheck="false"
              />
              <span class="field-hint">Used as the git tag for this version.</span>
            </label>
          </div>

          {#if form?.publish && form.message}
            <p class="form-message error">{form.message}</p>
          {/if}

          <div class="form-actions">
            <button class="button primary" type="submit">Publish version</button>
          </div>
        </form>
      {:else}
        <article class="card">
          <h2>Source: GitHub</h2>
          <p>
            This project is read-only here: commits and tags come from the repository. The site caches the lean design
            at each synced commit and renders it locally.
          </p>
          <p>
            <a class="mono wrap-anywhere" href={data.project.repoUrl} target="_blank" rel="noopener noreferrer"
              >{data.project.repoUrl}</a
            >
          </p>
          <form method="POST" action="?/sync">
            <button class="button primary" type="submit">Sync now</button>
          </form>
          {#if form?.sync}
            <p class="form-message" class:ok={form.ok} class:error={!form.ok}>{form.message}</p>
          {/if}
        </article>
      {/if}
    </div>

    <aside class="card">
      <h2>Versions</h2>
      {#if data.versions.length === 0}
        <p>Nothing published yet.</p>
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
                    {version.status}
                  </span>
                  {#if data.activeVersionId === version.id}
                    <span class="badge ok">active</span>
                  {/if}
                </div>
                <time class="version-date" datetime={version.authoredAt.toISOString()}>
                  {date.format(version.authoredAt)}
                </time>
                {#if version.status === 'failed' && version.errorDetail}
                  <p class="form-message error">{version.errorDetail}</p>
                {/if}
              </div>
              {#if version.status === 'ready' && data.activeVersionId !== version.id}
                <form method="POST" action="?/activate" class="version-action">
                  <input type="hidden" name="versionId" value={version.id} />
                  <button class="button small" type="submit">Set active</button>
                </form>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </aside>
  </div>
</section>
