<script lang="ts">
  import { page } from '$app/state';
  import { LOCALE_LABELS, LOCALES } from '../i18n/config';
  import { getI18n } from '../i18n/context';

  const { t, locale } = getI18n();
  const redirectTo = `${page.url.pathname}${page.url.search}`;
</script>

<form method="POST" action="/language" class="language-switch" data-language-form>
  <label for="language-select">{t('language.label')}</label>
  <select id="language-select" name="language">
    {#each LOCALES as entry (entry)}
      <option value={entry} selected={entry === locale}>{LOCALE_LABELS[entry]}</option>
    {/each}
  </select>
  <input type="hidden" name="redirect" value={redirectTo} />
  <noscript>
    <button class="button small" type="submit">{t('language.apply')}</button>
  </noscript>
</form>
