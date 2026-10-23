<svelte:head>
  <title>About — SolidCraft Gallery</title>
</svelte:head>

<section class="shell prose">
  <h1>A gallery that keeps the file.</h1>
  <p>
    SolidCraft Gallery is a public, git-backed home for SolidCraft designs. A project is a repository, a version is a
    commit, and a release is a tag. The site renders previews, measures the model and makes the design searchable
    without changing the file you saved.
  </p>
  <p>
    The implementation is documented in the repository: decisions in
    <code>docs/00-decisions.md</code>, the repository contract in
    <code>docs/03-repo-format.md</code>, and the milestones in
    <code>docs/14-roadmap.md</code>.
  </p>
  <h2>Status</h2>
  <p>
    This is the M1 slice: accounts, hosted and external projects, publishing, previews, search and the public gallery.
    Moderation, API tokens and the admin surfaces come next. Nothing here pretends to be finished.
  </p>
  <h2>Built on</h2>
  <p>
    <a href="https://github.com/tangency-labs/solidcraft">SolidCraft</a> for the design format and the
    <code>solidcraft-cli</code> renderer, Forgejo for hosted git, SvelteKit and PostgreSQL for the site.
  </p>
</section>
