<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head>
  <title>Dashboard — SolidCraft Gallery</title>
</svelte:head>

<section class="shell" style="padding: 48px 0 80px">
  <div style="display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap">
    <div>
      <p class="eyebrow">Dashboard</p>
      <h1 style="letter-spacing: -0.03em; margin: 14px 0 8px">Hello, {data.viewer.username}</h1>
      <p style="color: var(--muted); margin: 0">
        Signed in as <span class="mono">{data.viewer.role}</span>. New projects are private until you publish a ready
        version and choose otherwise.
      </p>
    </div>
    <form method="POST" action="/auth/logout">
      <button class="button" type="submit">Sign out</button>
    </form>
  </div>

  <div class="grid" style="padding: 32px 0 8px; grid-template-columns: minmax(260px, 1fr) 2fr">
    <article class="card">
      <h2>New hosted project</h2>
      <p style="margin-bottom: 14px">Creates a private git repository on this instance.</p>
      <form method="POST" action="?/create" style="display: grid; gap: 10px">
        <label for="title" style="font-size: 13px; color: var(--muted)">Title</label>
        <input
          id="title"
          name="title"
          required
          maxlength="120"
          placeholder="Raspberry Pi 4 case"
          style="padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
        />
        <label for="slug" style="font-size: 13px; color: var(--muted)">Slug (optional)</label>
        <input
          id="slug"
          name="slug"
          maxlength="64"
          placeholder="pi-case"
          style="padding: 10px 12px; border-radius: 9px; border: 1px solid var(--border); background: var(--panel-2); color: var(--text); font: inherit"
        />
        <button class="button primary" type="submit">Create project</button>
      </form>
      {#if form?.message}
        <p style="color: var(--warn); margin: 12px 0 0; font-size: 13px">{form.message}</p>
      {/if}
    </article>

    <article class="card">
      <h2>Your projects</h2>
      {#if data.projects.length === 0}
        <p>No projects yet. Create one on the left, then publish a `.solidcraft` file.</p>
      {:else}
        <ul style="list-style: none; padding: 0; margin: 0; display: grid; gap: 10px">
          {#each data.projects as project (project.id)}
            <li
              style="display: flex; align-items: center; gap: 12px; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 10px"
            >
              <div>
                <a href={`/dashboard/projects/${project.id}`} style="font-weight: 600">{project.title}</a>
                <div class="mono" style="color: var(--muted); font-size: 12px; margin-top: 2px">
                  {project.slug}
                </div>
              </div>
              <div style="display: flex; gap: 8px; align-items: center">
                <span class="badge">{project.visibility}</span>
                <span class="badge">{project.status}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </article>
  </div>
</section>
