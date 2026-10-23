import { randomUUID } from 'node:crypto';
import type { Handle } from '@sveltejs/kit/hooks';
import { LANGUAGE_COOKIE, resolveLocale } from './lib/i18n/config.js';

/** Merge `Vary` values without clobbering whatever SvelteKit already set. */
function addVary(headers: Headers, value: string): void {
  const values = new Set(
    (headers.get('vary') ?? '')
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const part of value.split(',')) values.add(part.trim().toLowerCase());
  headers.set('vary', [...values].join(', '));
}

/**
 * Request id + baseline security headers. CSP is added with the auth milestone:
 * SvelteKit's inline bootstrap script needs a nonce, and a half-configured CSP
 * that breaks the app is worse than none for the scaffold.
 *
 * The locale is resolved once per request: the preference cookie (mirrored
 * from localStorage) wins over `Accept-Language`, which wins over English.
 * `%lang%` in `app.html` is replaced before the page is painted.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('x-request-id')?.slice(0, 128) ?? randomUUID();
  event.locals.requestId = requestId;

  const locale = resolveLocale(event.cookies.get(LANGUAGE_COOKIE), event.request.headers.get('accept-language'));
  event.locals.locale = locale;

  const response = await resolve(event, {
    transformPageChunk: ({ html }) => html.replaceAll('%lang%', locale),
  });
  response.headers.set('content-language', locale);
  addVary(response.headers, 'accept-language, cookie');
  response.headers.set('x-request-id', requestId);
  response.headers.set('x-content-type-options', 'nosniff');
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  return response;
};
