<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Dashboard — SolidCraft Gallery</title>
</svelte:head>

<section class="shell dashboard-page">
  <div class="dashboard-head">
    <div>
      <h1>Hello, {data.viewer.username}</h1>
      <p>
        Signed in as <span class="mono">{data.viewer.role}</span>. New projects are private until you publish a ready
        version and choose otherwise.
      </p>
    </div>
    <form method="POST" action="/auth/logout">
      <button class="button small" type="submit">Sign out</button>
    </form>
  </div>

  <div class="dashboard-grid">
    <article class="card">
      <h2>New hosted project</h2>
      <p>Creates a private git repository on this instance.</p>
      <form method="POST" action="?/create" class="form-stack">
        <label class="field" for="title">
          <span>Title</span>
          <input id="title" name="title" required maxlength="120" placeholder="Raspberry Pi 4 case" />
        </label>
        <label class="field" for="slug">
          <span>Slug (optional)</span>
          <input id="slug" name="slug" maxlength="64" placeholder="pi-case" autocapitalize="off" spellcheck="false" />
          <span class="field-hint">Used in the project URL. Defaults to the title.</span>
        </label>
        <button class="button primary block" type="submit">Create project</button>
      </form>
      {#if form?.message && !form.connect}
        <p class="form-message error">{form.message}</p>
      {/if}
    </article>

    <article class="card">
      <h2>Your projects</h2>
      {#if data.projects.length === 0}
        <p>No projects yet. Create one on the left, then publish a `.solidcraft` file.</p>
      {:else}
        <ul class="project-list">
          {#each data.projects as project (project.id)}
            <li>
              <div class="project-main">
                <a class="project-title" href={`/dashboard/projects/${project.id}`}>{project.title}</a>
                <span class="project-slug">{project.slug}</span>
              </div>
              <div class="project-badges">
                <span class="badge">{project.repoProvider}</span>
                <span class="badge">{project.visibility}</span>
                <span
                  class:ok={project.status === 'ready'}
                  class:warn={project.status === 'error' || project.status === 'quarantined'}
                  class="badge"
                >
                  {project.status}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </div>

  <article class="card dashboard-connect">
    <h2>Connect a public GitHub repository</h2>
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
      <button class="button primary" type="submit">Connect</button>
    </form>
    {#if form?.connect}
      <p class="form-message error">{form.message}</p>
    {/if}
  </article>
</section>
