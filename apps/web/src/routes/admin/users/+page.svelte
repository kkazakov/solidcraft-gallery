<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';

  let { data } = $props();
  const { t, tp, enumLabel, formatDate } = getI18n();

  function pageHref(target: number): string {
    return target > 1 ? `/admin/users?page=${target}` : '/admin/users';
  }
</script>

<svelte:head>
  <title>{t('admin.users.title')}</title>
</svelte:head>

<div class="admin-section-head">
  <h2>{t('admin.users.heading')}</h2>
  <p class="result-count">{tp('admin.users.count', data.total)} · {t('admin.users.intro')}</p>
</div>

{#if data.users.length === 0}
  <article class="card empty-card">
    <h2>{t('admin.users.empty')}</h2>
  </article>
{:else}
  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">{t('admin.users.user')}</th>
          <th scope="col">{t('admin.users.role')}</th>
          <th scope="col">{t('admin.users.providers')}</th>
          <th scope="col" class="num">{t('admin.users.projects')}</th>
          <th scope="col">{t('admin.users.joined')}</th>
          <th scope="col">{t('admin.users.lastSeen')}</th>
          <th scope="col">{t('admin.users.status')}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.users as user (user.id)}
          <tr>
            <td>
              <div class="admin-user">
                <strong>{user.username}</strong>
                {#if user.displayName && user.displayName !== user.username}
                  <span class="admin-sub">{user.displayName}</span>
                {/if}
                {#if user.email}
                  <span class="admin-sub mono wrap-anywhere">{user.email}</span>
                {:else}
                  <span class="admin-sub">{t('admin.users.noEmail')}</span>
                {/if}
              </div>
            </td>
            <td>
              <span class="badge" class:ok={user.role === 'admin'}>
                {user.role === 'admin' ? t('admin.users.admin') : t('admin.users.userRole')}
              </span>
            </td>
            <td>
              {#if user.providers.length > 0}
                <span class="badge-row">
                  {#each user.providers as provider (provider)}
                    <span class="badge">{enumLabel('provider', provider)}</span>
                  {/each}
                </span>
              {:else}
                <span class="admin-muted">{t('admin.users.noProviders')}</span>
              {/if}
            </td>
            <td class="num">{user.projectCount}</td>
            <td class="num">
              <time datetime={user.createdAt.toISOString()}>
                {formatDate(user.createdAt, { dateStyle: 'medium' })}
              </time>
            </td>
            <td class="num">
              {#if user.lastSeenAt}
                <time datetime={user.lastSeenAt.toISOString()}>
                  {formatDate(user.lastSeenAt, { dateStyle: 'medium' })}
                </time>
              {:else}
                <span class="admin-muted">{t('admin.users.never')}</span>
              {/if}
            </td>
            <td>
              {#if user.suspendedAt}
                <span class="badge warn">{t('admin.users.suspended')}</span>
                <span class="admin-sub">
                  {formatDate(user.suspendedAt, { dateStyle: 'medium' })}
                </span>
              {:else}
                <span class="badge ok">{t('admin.users.active')}</span>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

{#if data.pages > 1}
  <nav class="pagination" aria-label={t('common.pagination')}>
    {#if data.page > 1}
      <a class="button small" href={pageHref(data.page - 1)}>{t('common.previous')}</a>
    {/if}
    <span>{t('common.page', { page: data.page, pages: data.pages })}</span>
    {#if data.page < data.pages}
      <a class="button small" href={pageHref(data.page + 1)}>{t('common.next')}</a>
    {/if}
  </nav>
{/if}
