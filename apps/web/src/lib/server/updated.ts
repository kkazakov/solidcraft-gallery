/**
 * Injected by `vite.config.ts` when the dev server starts or `vite build` runs.
 * In the deployed image this is the moment the release was built, not the
 * moment a visitor requests the page.
 */
declare const __SITE_BUILT_AT__: string;

/** The instant the running web bundle was built. */
export function siteBuiltAt(): Date {
  // `typeof` keeps the module usable if it is ever evaluated outside Vite.
  const value = typeof __SITE_BUILT_AT__ === 'string' ? __SITE_BUILT_AT__ : '';
  const built = new Date(value);
  return Number.isNaN(built.getTime()) ? new Date() : built;
}

/**
 * Formats an instant as `11:55 CEST, 23 Oct 2026`. `Intl` returns the parts in
 * locale order, so they are read individually and composed time-first.
 */
export function formatUpdatedAt(value: Date, timeZone?: string, locale = 'en-GB'): string {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(value);

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? '';

  return `${part('hour')}:${part('minute')} ${part('timeZoneName')}, ${part('day')} ${part('month')} ${part('year')}`;
}
