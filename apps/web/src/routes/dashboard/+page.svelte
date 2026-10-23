<script lang="ts">
  import LanguageSwitcher from '../../lib/components/LanguageSwitcher.svelte';
  import { getI18n } from '../../lib/i18n/context';

  let { data } = $props();
  const { t, tp, enumLabel } = getI18n();
</script>

<svelte:head>
  <title>{t('dashboard.title')}</title>
</svelte:head>

<section class="shell dashboard-page">
  <div class="dashboard-head">
    <div>
      <h1>{t('dashboard.heading')}</h1>
      <p>
        {tp('dashboard.projectCount', data.projects.length)} · {t('dashboard.signedInAs', {
          role: data.viewer.role,
        })}
      </p>
    </div>
    <div class="page-actions">
      <LanguageSwitcher />
      <form method="POST" action="/auth/logout">
        <button class="button small" type="submit">{t('common.signOut')}</button>
      </form>
      <a class="button primary" href="/dashboard/projects/new">{t('common.createProject')}</a>
    </div>
  </div>

  {#if data.projects.length === 0}
    <article class="card empty-card">
      <h2>{t('dashboard.emptyTitle')}</h2>
      <p>{t('dashboard.emptyBody')}</p>
      <a class="button primary" href="/dashboard/projects/new">{t('common.createProject')}</a>
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
              <span class="badge">{enumLabel('visibility', project.visibility)}</span>
              <span
                class:ok={project.status === 'ready'}
                class:warn={project.status === 'error' || project.status === 'quarantined'}
                class="badge"
              >
                {enumLabel('status', project.status)}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
