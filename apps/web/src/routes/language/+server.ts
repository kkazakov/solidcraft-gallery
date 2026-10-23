import { error, redirect } from '@sveltejs/kit';
import { isLocale, LANGUAGE_COOKIE, LANGUAGE_COOKIE_MAX_AGE } from '../../lib/i18n/config.js';

const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Only allow redirects back into this site. `redirect` comes from a hidden
 * field, so it is untrusted input even though the dashboard sets it.
 */
function safeTarget(value: string, origin: string): string {
  if (!value) return '/dashboard';
  const parsed = new URL(value, origin);
  if (parsed.origin !== origin) return '/dashboard';
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export async function POST({ request, cookies, url }) {
  const form = await request.formData();
  const requested = String(form.get('language') ?? '');
  if (!isLocale(requested)) throw error(400, 'Unsupported language');

  // Readable by the bootstrap script as well as the server, so a stale cookie
  // can be repaired from localStorage. It contains no personal data.
  cookies.set(LANGUAGE_COOKIE, requested, {
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    secure: PRODUCTION,
    maxAge: LANGUAGE_COOKIE_MAX_AGE,
  });

  throw redirect(303, safeTarget(String(form.get('redirect') ?? ''), url.origin));
}
