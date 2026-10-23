/**
 * Supported UI locales. Add a locale here and in `messages.ts`; the rest of the
 * site reads the list rather than hard-coding codes.
 */
export const LOCALES = ['en', 'bg', 'fr', 'de', 'es'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** Preference cookie mirrored from localStorage so SSR can render the choice. */
export const LANGUAGE_COOKIE = 'gallery-language';

/** The browser-owned copy of the preference. The dashboard writes this key. */
// app.html mirrors this key and the locale list in its pre-paint bootstrap.
export const LANGUAGE_STORAGE_KEY = 'gallery-language';

export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/** Native names, deliberately not translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  bg: 'Български',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * Turn a browser/HTTP language tag into a supported locale. A missing region is
 * fine (`bg-BG` → `bg`); an unsupported language returns null and the caller
 * falls back to the next source.
 */
export function normalizeLocale(value: string | null | undefined): Locale | null {
  if (!value) return null;
  const base = value.trim().toLowerCase().split(/[-_]/, 1)[0] ?? '';
  return isLocale(base) ? base : null;
}

interface LanguageRange {
  tag: string;
  quality: number;
  index: number;
}

/**
 * Parse an `Accept-Language` header and pick the best supported locale.
 * q-values are honoured, `q=0` means "not acceptable", and order breaks ties.
 */
export function preferredLocaleFromHeader(header: string | null | undefined): Locale | null {
  if (!header) return null;

  const ranges: LanguageRange[] = header
    .split(',')
    .map((part, index): LanguageRange => {
      const [rawTag, ...parameters] = part.trim().split(';');
      let quality = 1;
      for (const parameter of parameters) {
        const [name, rawValue] = parameter.trim().split('=');
        if (name !== 'q') continue;
        const parsed = Number.parseFloat(rawValue ?? '');
        quality = Number.isFinite(parsed) ? parsed : 0;
      }
      return { tag: rawTag?.trim().toLowerCase() ?? '', quality, index };
    })
    .filter((range) => range.tag.length > 0 && range.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const range of ranges) {
    if (range.tag === '*') return DEFAULT_LOCALE;
    const locale = normalizeLocale(range.tag);
    if (locale) return locale;
  }

  return null;
}

/**
 * Precedence: explicit preference (cookie, mirrored from localStorage) →
 * `Accept-Language` → English.
 */
export function resolveLocale(
  cookieValue: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  return normalizeLocale(cookieValue) ?? preferredLocaleFromHeader(acceptLanguage) ?? DEFAULT_LOCALE;
}
