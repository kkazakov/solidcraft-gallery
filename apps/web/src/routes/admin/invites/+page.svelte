<script lang="ts">
  import { getI18n } from '../../../lib/i18n/context';
  import type { MessageKey } from '../../../lib/i18n/messages';

  let { data, form } = $props();
  const { t, tp, formatDate } = getI18n();

  const ERRORS: Record<string, MessageKey> = {
    uses: 'admin.invites.errorUses',
    days: 'admin.invites.errorDays',
    note: 'admin.invites.errorNote',
  };

  const STATE_LABELS: Record<string, MessageKey> = {
    active: 'admin.invites.stateActive',
    expired: 'admin.invites.stateExpired',
    exhausted: 'admin.invites.stateExhausted',
    revoked: 'admin.invites.stateRevoked',
  };

  type Values = { uses: string; days: string; note: string };

  const values = $derived(form && 'uses' in form ? (form as unknown as Values) : null);
  const errorKey = $derived(form && 'error' in form ? (ERRORS[String(form.error)] ?? null) : null);

  function stateLabel(state: string): string {
    return t(STATE_LABELS[state] ?? 'admin.invites.stateActive');
  }

  function pageHref(target: number): string {
    return target > 1 ? `/admin/invites?page=${target}` : '/admin/invites';
  }
</script>

<svelte:head>
  <title>{t('admin.invites.title')}</title>
</svelte:head>

<div class="admin-section-head">
  <h2>{t('admin.invites.heading')}</h2>
  <p class="result-count">{tp('admin.invites.count', data.total)} · {t('admin.invites.intro')}</p>
</div>

{#if data.notice === 'deleted'}
  <p class="notice-ok admin-notice" role="status">{t('admin.invites.deleted')}</p>
{:else if data.notice === 'missing'}
  <p class="notice admin-notice" role="status">{t('admin.invites.missing')}</p>
{/if}

{#if data.created}
  <article class="card admin-secret" role="status">
    <h2>{t('admin.invites.createdTitle')}</h2>
    <p>{t('admin.invites.createdBody')}</p>
    <div class="admin-secret-row">
      <span class="field-hint">{t('admin.invites.createdCode')}</span>
      <code class="admin-secret-value">{data.created.code}</code>
    </div>
    <div class="admin-secret-row">
      <span class="field-hint">{t('admin.invites.createdLink')}</span>
      <code class="admin-secret-value">{data.created.url}</code>
    </div>
    <p class="form-message">{t('admin.invites.createdOnce')}</p>
  </article>
{/if}

<form class="card admin-create" method="POST" action="?/create">
  <h2>{t('admin.invites.createHeading')}</h2>
  <p>{t('admin.invites.createIntro')}</p>

  {#if errorKey}
    <p class="notice">{t(errorKey)}</p>
  {/if}

  <div class="form-row">
    <label class="field" for="uses">
      <span>{t('admin.invites.uses')}</span>
      <input id="uses" name="uses" type="number" min="1" max="1000" step="1" value={values?.uses ?? '1'} required />
    </label>
    <label class="field" for="days">
      <span>{t('admin.invites.days')}</span>
      <input id="days" name="days" type="number" min="1" max="365" step="1" value={values?.days ?? '14'} required />
    </label>
    <label class="field" for="note">
      <span>{t('admin.invites.noteLabel')}</span>
      <input id="note" name="note" maxlength="200" value={values?.note ?? ''} autocomplete="off" />
    </label>
    <button class="button primary" type="submit">{t('admin.invites.create')}</button>
  </div>
  <div class="admin-hints">
    <span>{t('admin.invites.usesHint')}</span>
    <span>{t('admin.invites.daysHint')}</span>
    <span>{t('admin.invites.noteHint')}</span>
  </div>
</form>

{#if data.invites.length === 0}
  <article class="card empty-card">
    <h2>{t('admin.invites.empty')}</h2>
  </article>
{:else}
  <div class="admin-table-wrap">
    <table class="admin-table">
      <thead>
        <tr>
          <th scope="col">{t('admin.invites.id')}</th>
          <th scope="col">{t('admin.invites.columnNote')}</th>
          <th scope="col" class="num">{t('admin.invites.uses')}</th>
          <th scope="col">{t('admin.invites.expires')}</th>
          <th scope="col">{t('admin.invites.created')}</th>
          <th scope="col">{t('admin.invites.state')}</th>
          <th scope="col"><span class="sr-only">{t('admin.invites.delete')}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each data.invites as invite (invite.id)}
          <tr>
            <td><code>#{invite.id.slice(0, 8)}</code></td>
            <td class="admin-note">
              {invite.note || t('admin.invites.noNote')}
            </td>
            <td class="num">{t('admin.invites.usesValue', { used: invite.uses, max: invite.maxUses })}</td>
            <td class="num">
              {#if invite.expiresAt}
                <time datetime={invite.expiresAt.toISOString()}>
                  {formatDate(invite.expiresAt, { dateStyle: 'medium' })}
                </time>
              {:else}
                <span class="admin-muted">{t('admin.invites.never')}</span>
              {/if}
            </td>
            <td>
              <time datetime={invite.createdAt.toISOString()}>
                {formatDate(invite.createdAt, { dateStyle: 'medium' })}
              </time>
              <span class="admin-sub">{t('admin.invites.createdBy', { username: invite.createdBy })}</span>
            </td>
            <td>
              <span
                class="badge"
                class:ok={invite.state === 'active'}
                class:warn={invite.state === 'expired' || invite.state === 'revoked'}
              >
                {stateLabel(invite.state)}
              </span>
            </td>
            <td class="admin-actions">
              <form method="POST" action="?/delete">
                <input type="hidden" name="id" value={invite.id} />
                <input type="hidden" name="page" value={data.page} />
                <button class="button small" type="submit">{t('admin.invites.delete')}</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="field-hint admin-delete-hint">{t('admin.invites.deleteHint')}</p>
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
