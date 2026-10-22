<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>{data.project.title} — Project — SolidCraft Gallery</title>
</svelte:head>

<section class="shell" style="padding: 48px 0 80px">
  <p class="eyebrow">Project</p>
  <h1 style="letter-spacing: -0.03em; margin: 14px 0 8px">{data.project.title}</h1>
  <div style="display: flex; gap: 8px; align-items: center; color: var(--muted); font-size: 14px">
    <span class="badge">{data.project.visibility}</span>
    <span class="badge">{data.project.status}</span>
    <span class="badge">{data.project.repoProvider}</span>
    <a href={`/${data.project.ownerUsername}/${data.project.slug}`}>View page</a>
  </div>

  <div class="grid" style="padding: 32px 0 0; grid-template-columns: minmax(280px, 2fr) minmax(260px, 1fr)">
    {#if data.project.repoProvider !== 'github'}
      <article class="card">
        <h2>Publish a design</h2>
        <p style="margin-bottom: 14px">
          The server strips the model cache, commits the file to <span class="mono"
            >designs/{data.project.slug}.solidcraft</span
          >, and queues previews.
        </p>
        {#if data.project.repoProvider === 'forgejo'}
          <p style="margin-bottom: 14px; font-size: 13px">
            Hosted on Forgejo:
            <a class="mono" href={data.project.repoUrl} target="_blank" rel="noopener noreferrer"
              >{data.project.repoUrl}</a
            >
          </p>
        {/if}
        <form method="POST" action="?/publish" enctype="multipart/form-data" style="display: grid; gap: 10px">
          <label for="design" style="font-size: 13px; color: var(--muted)">Design file</label>
          <input id="design" name="design" type="file" accept=".solidcraft" required />
          <label for="tag" style="font-size: 13px; color: var(--muted)">Release tag (optional)</label>
          <input
            id="tag"
            name="tag"
            maxlength="64"
            placeholder="v1.0.0"
            style="padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
          />
          <label for="message" style="font-size: 13px; color: var(--muted)">Commit message (optional)</label>
          <input
            id="message"
            name="message"
            maxlength="200"
            placeholder="First release"
            style="padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
          />
          <button class="button primary" type="submit">Publish</button>
        </form>
        {#if form?.message && !form.settings && !form.sync}
          <p style="color: var(--warn); margin: 12px 0 0; font-size: 13px">{form.message}</p>
        {/if}
      </article>
    {:else}
      <article class="card">
        <h2>Source: GitHub</h2>
        <p style="margin-bottom: 14px">
          This project is read-only here: commits and tags come from the repository. The site caches the lean design at
          each synced commit and renders it locally.
        </p>
        <p style="margin-bottom: 14px">
          <a class="mono" href={data.project.repoUrl} target="_blank" rel="noopener noreferrer"
            >{data.project.repoUrl}</a
          >
        </p>
        <form method="POST" action="?/sync">
          <button class="button primary" type="submit">Sync now</button>
        </form>
        {#if form?.sync}
          <p style="color: {form.ok ? 'var(--accent)' : 'var(--warn)'}; margin: 12px 0 0; font-size: 13px">
            {form.message}
          </p>
        {/if}
      </article>
    {/if}

    <article class="card">
      <h2>Versions</h2>
      {#if data.versions.length === 0}
        <p>Nothing published yet.</p>
      {:else}
        <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 10px">
          {#each data.versions as version (version.id)}
            <li style="border-bottom: 1px solid var(--border); padding-bottom: 8px">
              <div style="display: flex; justify-content: space-between; gap: 8px">
                <span class="mono">{version.tag ?? version.commitSha.slice(0, 7)}</span>
                <span class="badge">{version.status}</span>
              </div>
              {#if version.errorDetail}
                <p style="color: var(--warn); font-size: 12px; margin: 4px 0 0">{version.errorDetail}</p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </div>

  <article class="card" style="margin-top: 16px; max-width: 720px">
    <h2>Visibility and license</h2>
    <p style="margin-bottom: 12px">
      Public requires a ready preview and an SPDX license. Unlisted is reachable by link but excluded from search and
      the sitemap.
    </p>
    <form method="POST" action="?/settings" style="display: flex; gap: 10px; flex-wrap: wrap; align-items: end">
      <label style="display: grid; gap: 4px; font-size: 13px; color: var(--muted)">
        Visibility
        <select
          name="visibility"
          style="padding: 9px 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
        >
          <option value="private" selected={data.project.visibility === 'private'}>Private</option>
          <option value="unlisted" selected={data.project.visibility === 'unlisted'}>Unlisted</option>
          <option value="public" selected={data.project.visibility === 'public'}>Public</option>
        </select>
      </label>
      <label style="display: grid; gap: 4px; font-size: 13px; color: var(--muted); flex: 1; min-width: 180px">
        License (SPDX)
        <input
          name="license"
          value={data.project.license ?? ''}
          placeholder="CC-BY-4.0"
          maxlength="64"
          style="padding: 9px 10px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
        />
      </label>
      <button class="button primary" type="submit">Save</button>
    </form>
    {#if form?.settings && form.ok}
      <p style="color: var(--accent); margin: 10px 0 0; font-size: 13px">{form.message}</p>
    {:else if form?.settings && form.message}
      <p style="color: var(--warn); margin: 10px 0 0; font-size: 13px">{form.message}</p>
    {/if}
  </article>
</section>
