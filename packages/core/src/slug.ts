/**
 * Names that collide with application routes. Owners and projects may not use
 * them. Keep in sync with docs/03-repo-format.md.
 */
export const RESERVED_NAMES: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'auth',
  'dashboard',
  'login',
  'media',
  'robots.txt',
  'search',
  'sitemap.xml',
  't',
  'u',
  'webhooks',
]);

export interface SlugOptions {
  maxLength?: number;
  fallback?: string;
}

/**
 * Lowercase, ASCII, kebab-case. Unicode is decomposed and stripped of
 * combining marks so "Brackét" becomes "bracket" rather than an empty slug.
 */
export function slugify(input: string, options: SlugOptions = {}): string {
  const maxLength = options.maxLength ?? 64;
  const fallback = options.fallback ?? 'project';

  const ascii = input
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');

  if (ascii.length < 3) return fallback;
  return ascii;
}

export function isValidSlug(value: string, min = 3, max = 64): boolean {
  if (value.length < min || value.length > max) return false;
  if (RESERVED_NAMES.has(value)) return false;
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(value);
}

/** First free `base`, `base-2`, `base-3`… up to a bounded search. */
export function nextAvailableSlug(base: string, taken: Iterable<string>, maxTries = 1000): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < maxTries + 2; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`could not find a free slug for ${base}`);
}
