<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Your projects — SolidCraft Gallery</title>
</svelte:head>

<section class="shell dashboard-page">
  <div class="dashboard-head">
    <div>
      <h1>Your projects</h1>
      <p>
        {data.projects.length}
        {data.projects.length === 1 ? 'project' : 'projects'}
        · signed in as <span class="mono">{data.viewer.role}</span>
      </p>
    </div>
    <div class="page-actions">
      <form method="POST" action="/auth/logout">
        <button class="button small" type="submit">Sign out</button>
      </form>
      <a class="button primary" href="/dashboard/projects/new">Create project</a>
    </div>
  </div>

  {#if data.projects.length === 0}
    <article class="card empty-card">
      <h2>No projects yet</h2>
      <p>Create a project, publish a .solidcraft file, and its preview will appear here.</p>
      <a class="button primary" href="/dashboard/projects/new">Create project</a>
    </article>
  {:else}
    <div class="card project-table">
      <ul class="project-list">
        {#each data.projects as project (project.id)}
          <li>
            <div class="project-main">
              <a class="project-title" href={`/dashboard/projects/${project.id}`}>{project.title}</a>
              <span class="project-slug">{project.slug}</span>
            </div>
            <div class="project-badges">
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
    </div>
  {/if}
</section>
