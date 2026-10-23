<script lang="ts">
  import '../app.css';

  let { data, children } = $props();
</script>

<header class="site-header">
  <div class="shell">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true">SC</span>
      <span>SolidCraft Gallery</span>
    </a>
    <nav class="nav" aria-label="Main">
      <a href="/search">Search</a>
      <a href="/about">About</a>
      {#if data.viewer}
        <a href="/dashboard">Dashboard</a>
      {:else}
        <a href="/auth/login">Sign in</a>
      {/if}
      <label class="sr-only" for="theme-select">Color theme</label>
      <select id="theme-select" class="theme-select" aria-label="Color theme">
        <option value="system" selected>System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
      <a href="https://github.com/kkazakov/solidcraft-gallery">GitHub</a>
    </nav>
  </div>
</header>

<main>
  {@render children()}
</main>

<footer class="site-footer">
  <div class="shell">
    <span>Built in the open. Designs remain the property of their authors.</span>
    <a href="/about">About</a>
    <a href="/terms">Terms</a>
    <a href="/privacy">Privacy</a>
    <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a>
  </div>
</footer>
