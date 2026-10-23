<svelte:head>
  <title>About — SolidCraft Gallery</title>
  <meta
    name="description"
    content="SolidCraft Gallery is a public, git-backed gallery for browsing, searching, previewing and downloading SolidCraft designs."
  />
</svelte:head>

<section class="shell prose">
  <h1>About SolidCraft Gallery</h1>
  <p>
    SolidCraft Gallery is a public, git-backed gallery for
    <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a> designs. It gives designers a place to publish their
    work and gives everyone else a way to browse, search, preview and download it.
  </p>
  <p>
    Every project is a git repository, and every version is a commit or tag. The gallery reads the repository, renders
    previews, records measurements and indexes the design for search. It does not convert or rewrite the file, so a
    download is the same <code>.solidcraft</code> the author saved.
  </p>

  <h2>What you can do</h2>
  <ul>
    <li>Browse and search public designs by title, description, tag and license.</li>
    <li>View previews, dimensions, version history and the project README.</li>
    <li>Download the <code>.solidcraft</code> file, and STEP or STL when the author published them.</li>
    <li>Sign in to publish designs, keep private projects and import a public GitHub repository.</li>
  </ul>

  <h2>What it is for</h2>
  <p>
    The project exists to make SolidCraft designs easy to find, compare and reuse under the license their authors
    choose. It is aimed at hobbyists, makers and small teams who want a lightweight public portfolio while keeping git
    as the source of truth.
  </p>

  <h2>Status</h2>
  <p>
    The gallery is in public beta. Accounts, hosted and imported projects, publishing, previews, search and downloads
    work today; moderation tools and a wider API are still being built. The source is on
    <a href="https://github.com/kkazakov/solidcraft-gallery">GitHub</a>.
  </p>

  <h2>Built with</h2>
  <p>
    SolidCraft and <code>solidcraft-cli</code> handle the design format and rendering, Forgejo provides hosted git, and SvelteKit
    with PostgreSQL runs the site.
  </p>
</section>
