<script lang="ts">
  import '../app.css';

  let { data, children } = $props();
</script>

<a class="skip-link" href="#main">Skip to content</a>

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
      <a href="https://github.com/kkazakov/solidcraft-gallery">GitHub</a>
      <button
        id="theme-toggle"
        class="theme-toggle"
        type="button"
        aria-label="Theme: System. Switch to Light."
        title="Theme: System. Switch to Light."
      >
        <svg class="theme-icon theme-icon-system" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8"></circle>
          <path d="M12 4a8 8 0 0 1 0 16V4Z"></path>
        </svg>
        <svg class="theme-icon theme-icon-light" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4"></circle>
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          ></path>
        </svg>
        <svg class="theme-icon theme-icon-dark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5a8.5 8.5 0 1 0 11.1 11.1Z"></path>
        </svg>
      </button>
    </nav>
  </div>
</header>

<main id="main">
  {@render children()}
</main>

<footer class="site-footer">
  <div class="shell">
    <span class="footer-note">Built in the open. Designs remain the property of their authors.</span>
    <nav class="footer-links" aria-label="Footer">
      <a href="/about">About</a>
      <a href="/terms">Terms</a>
      <a href="/privacy">Privacy</a>
      <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a>
    </nav>
  </div>
  <div class="shell footer-updated">
    <span>
      Updated:
      <time datetime={data.siteUpdated.iso} data-site-updated>{data.siteUpdated.label}</time>
    </span>
  </div>
</footer>
