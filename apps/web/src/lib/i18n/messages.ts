import { DEFAULT_LOCALE, type Locale } from './config.js';
import { bg } from './bg.js';
import { en } from './en.js';

/** Every message key, inferred from the English source dictionary. */
export type MessageKey = keyof typeof en;

/** A complete dictionary. `bg.ts` is typed with this so keys cannot drift. */
export type Dictionary = Record<MessageKey, string>;

export type MessageParams = Record<string, string | number>;

type PluralOneKey = Extract<MessageKey, `${string}.one`>;

/** Base key of a plural pair, for example `home.publicDesigns`. */
export type PluralKey = PluralOneKey extends `${infer Base}.one` ? Base : never;

const DICTIONARIES: Record<Locale, Dictionary> = { en, bg };

function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

function interpolate(template: string, params: MessageParams | undefined): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Translate one key, replacing `{name}` placeholders. Unknown keys render as-is. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  return interpolate(dictionaryFor(locale)[key] ?? key, params);
}

/**
 * Pick the `one`/`other` (or `few`/`many`, when a locale defines them) variant
 * with `Intl.PluralRules`, falling back to `other`.
 */
export function translatePlural(locale: Locale, key: PluralKey, count: number, params?: MessageParams): string {
  const dictionary = dictionaryFor(locale);
  const category = new Intl.PluralRules(locale).select(count);
  const variant = `${key}.${category}` as MessageKey;
  const fallback = `${key}.other` as MessageKey;
  return interpolate(dictionary[variant] ?? dictionary[fallback] ?? key, { count, ...params });
}

/**
 * Translate an enum-like value (`visibility.public`, `status.ready`,
 * `provider.github`). Unknown values are returned unchanged so a new database
 * status never renders as a raw key.
 */
export function translateEnum(locale: Locale, prefix: string, value: string): string {
  const key = `${prefix}.${value}` as MessageKey;
  const dictionary = dictionaryFor(locale);
  return key in dictionary ? dictionary[key] : value;
}
