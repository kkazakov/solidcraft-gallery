import { getContext, setContext } from 'svelte';
import { DEFAULT_LOCALE, type Locale } from './config.js';
import {
  translate,
  translateEnum,
  translatePlural,
  type MessageKey,
  type MessageParams,
  type PluralKey,
} from './messages.js';

export interface I18n {
  locale: Locale;
  t(key: MessageKey, params?: MessageParams): string;
  tp(key: PluralKey, count: number, params?: MessageParams): string;
  enumLabel(prefix: string, value: string): string;
  formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
  formatNumber(value: number, options?: Intl.NumberFormatOptions): string;
}

const I18N_CONTEXT = Symbol('gallery.i18n');

function createI18n(locale: Locale): I18n {
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
    tp: (key, count, params) => translatePlural(locale, key, count, params),
    enumLabel: (prefix, value) => translateEnum(locale, prefix, value),
    formatDate: (value, options = { dateStyle: 'medium' }) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  };
}

/**
 * Set the locale for the component tree rooted at the layout. Every page and
 * shared component reads it with `getI18n()`, so no route needs to thread a
 * `t` prop around.
 */
export function setI18n(locale: Locale): I18n {
  const i18n = createI18n(locale);
  setContext(I18N_CONTEXT, i18n);
  return i18n;
}

/** Fall back to English outside a localized tree (for example a failed layout). */
export function getI18n(): I18n {
  return getContext<I18n | undefined>(I18N_CONTEXT) ?? createI18n(DEFAULT_LOCALE);
}
