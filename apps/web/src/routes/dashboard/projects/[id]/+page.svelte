<script lang="ts">
  let { data, form } = $props();
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
        <a href={`/${data.project.ownerUsername}/${data.project.slug}`}>View page</a>
      </div>
    </div>
  </div>

  <div class="split">
    {#if data.project.repoProvider !== 'github'}
      <article class="card">
        <h2>Publish a design</h2>
        <p>
          The server strips the model cache, commits the file to <code>designs/{data.project.slug}.solidcraft</code>,
          and queues previews.
        </p>
        {#if data.project.repoProvider === 'forgejo'}
          <p>
            Hosted on Forgejo:
            <a class="mono wrap-anywhere" href={data.project.repoUrl} target="_blank" rel="noopener noreferrer"
              >{data.project.repoUrl}</a
            >
          </p>
        {/if}
        <form method="POST" action="?/publish" enctype="multipart/form-data" class="form-stack">
          <label class="field" for="design">
            <span>Design file</span>
            <input id="design" name="design" type="file" accept=".solidcraft" required />
            <span class="field-hint">A .solidcraft container, up to 25 MB.</span>
          </label>
          <label class="field" for="tag">
            <span>Release tag (optional)</span>
            <input id="tag" name="tag" maxlength="64" placeholder="v1.0.0" autocapitalize="off" spellcheck="false" />
          </label>
          <label class="field" for="message">
            <span>Commit message (optional)</span>
            <input id="message" name="message" maxlength="200" placeholder="First release" />
          </label>
          <button class="button primary block" type="submit">Publish</button>
        </form>
        {#if form?.message && !form.settings && !form.sync}
          <p class="form-message error">{form.message}</p>
        {/if}
      </article>
    {:else}
      <article class="card">
        <h2>Source: GitHub</h2>
        <p>
          This project is read-only here: commits and tags come from the repository. The site caches the lean design at
          each synced commit and renders it locally.
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

    <article class="card">
      <h2>Versions</h2>
      {#if data.versions.length === 0}
        <p>Nothing published yet.</p>
      {:else}
        <ul class="version-list">
          {#each data.versions as version (version.id)}
            <li>
              <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
              <span class:ok={version.status === 'ready'} class:warn={version.status === 'failed'} class="badge">
                {version.status}
              </span>
              {#if version.errorDetail}
                <p class="form-message error">{version.errorDetail}</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </div>

  <div class="settings-grid">
    <article class="card">
      <h2>Project details</h2>
      <p>
        Changes the display title and the hosted <code>project.json</code>. The URL slug and repository name stay the
        same.
      </p>
      <form method="POST" action="?/rename" class="form-row">
        <label class="field">
          <span>Title</span>
          <input name="title" value={data.project.title} required maxlength="120" />
        </label>
        <button class="button primary" type="submit">Rename</button>
      </form>
      {#if data.saved === 'rename'}
        <p class="form-message ok">Saved</p>
      {:else if form?.rename && form.message}
        <p class="form-message error">{form.message}</p>
      {/if}
    </article>

    <article class="card">
      <h2>Visibility and license</h2>
      <p>
        Public requires a ready preview and an SPDX license. Unlisted is reachable by link but excluded from search and
        the sitemap.
      </p>
      <form method="POST" action="?/settings" class="form-row">
        <label class="field">
          <span>Visibility</span>
          <select name="visibility">
            <option value="private" selected={data.project.visibility === 'private'}>Private</option>
            <option value="unlisted" selected={data.project.visibility === 'unlisted'}>Unlisted</option>
            <option value="public" selected={data.project.visibility === 'public'}>Public</option>
          </select>
        </label>
        <label class="field">
          <span>License (SPDX)</span>
          <input
            name="license"
            value={data.project.license ?? ''}
            placeholder="CC-BY-4.0"
            maxlength="64"
            autocapitalize="off"
            spellcheck="false"
          />
        </label>
        <button class="button primary" type="submit">Save</button>
      </form>
      {#if data.saved === 'settings'}
        <p class="form-message ok">Saved</p>
      {:else if form?.settings && form.message}
        <p class="form-message error">{form.message}</p>
      {/if}
    </article>
  </div>
</section>
