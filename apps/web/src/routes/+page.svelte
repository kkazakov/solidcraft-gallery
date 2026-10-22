<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>SolidCraft Gallery — designs, versions and downloads</title>
  <meta
    name="description"
    content="A public, git-backed gallery for SolidCraft designs. Preview, search, download and share parametric CAD."
  />
</svelte:head>

<section class="hero shell">
  <span class="eyebrow"><span class="dot"></span> M0 scaffold · v{data.version}</span>
  <h1>Parametric CAD,<br />published like code.</h1>
  <p class="lede">
    A public gallery for SolidCraft designs. Every project is a git repository with a real
    <code>.solidcraft</code> file, rendered previews, measurements and searchable metadata. Private work stays private until
    you publish it.
  </p>
  <div class="actions">
    <a class="button primary" href="/search">Browse designs</a>
    <a class="button" href="/about">Read the plan</a>
  </div>
</section>

<section class="status shell" aria-label="Project status">
  <div class="item">
    <div class="label">Format</div>
    <div class="value">Direct <span class="mono">.solidcraft</span></div>
  </div>
  <div class="item">
    <div class="label">Git</div>
    <div class="value">Hosted or bring your own</div>
  </div>
  <div class="item">
    <div class="label">Privacy</div>
    <div class="value">Private by default</div>
  </div>
  <div class="item">
    <div class="label">This build</div>
    <div class="value">Scaffold · M0</div>
  </div>
</section>

<section class="shell">
  <div class="grid">
    <article class="card">
      <h2>No conversion layer</h2>
      <p>
        The file you save is the file the site stores and serves. Only the disposable model cache is stripped, so
        history stays small and the download opens in SolidCraft.
      </p>
    </article>
    <article class="card">
      <h2>Your repository, your rules</h2>
      <p>
        Host a project here or connect a public GitHub, GitLab or Gitea repository. A push becomes a version; a tag
        becomes a release.
      </p>
    </article>
    <article class="card">
      <h2>Private by default</h2>
      <p>
        New projects are private. Public pages require a ready render and an SPDX license; unlisted projects are
        reachable by link but never indexed.
      </p>
    </article>
  </div>
</section>

<section class="shell prose">
  <h2>What is being built</h2>
  <p>
    The scaffold you are looking at is milestone M0 of the implementation plan: workspace, domain rules, database
    schema, job queue, render plan and the author CLI. The public gallery, search and authentication land in the
    following milestones.
  </p>
  <p>
    The full design is in the repository under <code>docs/</code>, starting with
    <code>docs/00-decisions.md</code> and <code>docs/14-roadmap.md</code>.
  </p>
</section>
