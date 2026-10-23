<script lang="ts">
  import { page } from '$app/state';
  import { getI18n } from '../../lib/i18n/context';

  let { children } = $props();
  const { t } = getI18n();

  const sections = $derived([
    {
      href: '/admin/users',
      label: t('admin.users'),
      current: page.url.pathname.startsWith('/admin/users'),
    },
    {
      href: '/admin/invites',
      label: t('admin.invites'),
      current: page.url.pathname.startsWith('/admin/invites'),
    },
  ]);
</script>

<svelte:head>
  <title>{t('admin.title')}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="shell admin-page">
  <div class="admin-head">
    <div>
      <h1>{t('admin.heading')}</h1>
      <p class="page-sub">{t('admin.intro')}</p>
    </div>
    <a class="quiet-link" href="/dashboard">{t('common.dashboard')}</a>
  </div>

  <div class="admin-layout">
    <div class="admin-content">
      {@render children()}
    </div>

    <aside class="admin-aside">
      <nav class="admin-menu" aria-label={t('admin.menu')}>
        <h2>{t('admin.menu')}</h2>
        {#each sections as section (section.href)}
          <a href={section.href} aria-current={section.current ? 'page' : undefined}>{section.label}</a>
        {/each}
      </nav>
    </aside>
  </div>
</section>
