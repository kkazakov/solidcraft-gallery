<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Search — SolidCraft Gallery</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="shell" style="padding: 56px 0 72px">
  <p class="eyebrow">Search</p>
  <h1 style="letter-spacing: -0.03em; font-size: clamp(32px, 4vw, 48px); margin: 16px 0 24px">Find a design</h1>

  <form method="GET" action="/search" style="display: flex; gap: 10px; max-width: 640px">
    <label for="q" style="position: absolute; left: -9999px">Query</label>
    <input
      id="q"
      name="q"
      value={data.q}
      placeholder="Enclosure, bracket, M3 standoff…"
      autocomplete="off"
      style="flex: 1; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); color: var(--text); font: inherit"
    />
    <button class="button primary" type="submit">Search</button>
  </form>

  {#if data.q}
    <p style="color: var(--muted); margin-top: 28px">
      Search is not wired yet. The public gallery and its index arrive in milestone M2; your query “{data.q}” was
      received.
    </p>
  {:else}
    <p style="color: var(--muted); margin-top: 28px">Search is not wired yet. The index arrives with milestone M2.</p>
  {/if}
</section>
