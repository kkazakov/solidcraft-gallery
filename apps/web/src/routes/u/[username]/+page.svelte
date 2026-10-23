<script lang="ts">
  import DesignCard from '../../../lib/components/DesignCard.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.user.username} — SolidCraft Gallery</title>
  <meta name="description" content={`Public SolidCraft designs by ${data.user.username}.`} />
</svelte:head>

<section class="shell page-head">
  <h1>{data.user.username}</h1>
  <p class="page-sub">{data.projects.length} public design{data.projects.length === 1 ? '' : 's'}</p>
</section>

<section class="shell section">
  {#if data.projects.length === 0}
    <article class="card empty-card">
      <h2>No public designs yet</h2>
      <p>This maker has not published a public project.</p>
    </article>
  {:else}
    <div class="design-grid">
      {#each data.projects as project (project.id)}
        <DesignCard {project} />
      {/each}
    </div>
  {/if}
</section>
