<script lang="ts">
  let { data, form } = $props();

  const selectedVisibility = $derived(form?.visibility ?? 'private');
</script>

<svelte:head>
  <title>Create project — SolidCraft Gallery</title>
</svelte:head>

<section class="shell dashboard-page">
  <nav class="breadcrumb" aria-label="Breadcrumb">
    <a href="/dashboard">Dashboard</a>
    <span class="sep" aria-hidden="true">/</span>
    <span>New project</span>
  </nav>

  <div class="dashboard-head">
    <div>
      <h1>Create project</h1>
      <p>Publish a .solidcraft file as a new version. The preview appears after the renderer finishes.</p>
    </div>
  </div>

  <form method="POST" action="?/create" enctype="multipart/form-data" class="card form-page" data-visibility-form>
    {#if form?.message && !form?.connect}
      <p class="notice">
        {form.message}
        {#if form.projectId}
          <a href={`/dashboard/projects/${form.projectId}`}>Open the project</a>
        {/if}
      </p>
    {/if}

    <div class="form-stack">
      <label class="field" for="title">
        <span>Project title</span>
        <input
          id="title"
          name="title"
          value={form?.title ?? ''}
          required
          maxlength="120"
          placeholder="Raspberry Pi 4 case"
        />
      </label>

      <label class="field" for="description">
        <span>Description</span>
        <textarea id="description" name="description" rows="3" maxlength="2000" placeholder="What the design is for."
          >{form?.description ?? ''}</textarea
        >
      </label>

      <div class="field">
        <span>Design file</span>
        <label class="upload-box" for="design">
          <span class="upload-title">Choose a .solidcraft file</span>
          <span class="field-hint">A SolidCraft container or JSON file, up to 25 MB.</span>
          <input id="design" name="design" type="file" accept=".solidcraft,application/zip,application/json" required />
        </label>
      </div>

      <div class="form-split">
        <label class="field" for="version">
          <span>Version</span>
          <input
            id="version"
            name="version"
            value={form?.version ?? 'v1.0.0'}
            maxlength="64"
            placeholder="v1.0.0"
            autocapitalize="off"
            spellcheck="false"
          />
          <span class="field-hint">Used as the git tag for this version.</span>
        </label>

        <label class="field" for="visibility">
          <span>Visibility</span>
          <select id="visibility" name="visibility" data-visibility-select>
            <option value="private" selected={selectedVisibility === 'private'}>Private</option>
            <option value="public" selected={selectedVisibility === 'public'}>Public</option>
          </select>
          <span class="field-hint">Public projects appear once the preview is ready.</span>
        </label>
      </div>

      <label class="field" for="license" data-license-field>
        <span>License</span>
        <select id="license" name="license" data-license-select>
          <option value="">Choose a license</option>
          {#each data.licenses as license (license.id)}
            <option value={license.id} selected={form?.license === license.id}>{license.name}</option>
          {/each}
        </select>
        <span class="field-hint">Required when the project is public. Uses GitHub's common license list.</span>
      </label>
    </div>

    <div class="form-actions">
      <button class="button primary" type="submit">Create project</button>
      <a class="button" href="/dashboard">Cancel</a>
    </div>
  </form>

  <details class="card connect-panel" open={Boolean(form?.connect)}>
    <summary>Import a public GitHub repository</summary>
    <p>
      The repository needs a <code>.solidcraft</code> file at the commit it points to. Add a
      <code>project.json</code> at the root to set the title, license and design path. The site caches the lean design and
      never writes to GitHub.
    </p>
    <form method="POST" action="?/connect" class="form-row">
      <label class="field">
        <span class="sr-only">Repository URL</span>
        <input
          name="url"
          type="url"
          required
          placeholder="https://github.com/jane/pi-case"
          autocomplete="off"
          spellcheck="false"
        />
      </label>
      <button class="button primary" type="submit">Import repository</button>
    </form>
    {#if form?.connect}
      <p class="form-message error">{form.message}</p>
    {/if}
  </details>
</section>
