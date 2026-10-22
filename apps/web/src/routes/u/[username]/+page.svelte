<script lang="ts">
  import DesignCard from '../../../lib/components/DesignCard.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.user.username} — SolidCraft Gallery</title>
  <meta name="description" content={`Public SolidCraft designs by ${data.user.username}.`} />
</svelte:head>

<section class="shell" style="padding: 48px 0 24px">
  <p class="eyebrow">Maker</p>
  <h1 style="letter-spacing: -0.03em; margin: 14px 0 8px">{data.user.username}</h1>
  <p style="color: var(--muted); margin: 0">
    {data.projects.length} public design{data.projects.length === 1 ? '' : 's'}
  </p>
</section>

<section class="shell" style="padding-bottom: 72px">
  {#if data.projects.length === 0}
    <article class="card" style="max-width: 640px">
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

<style>
  .design-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 18px;
  }
</style>
