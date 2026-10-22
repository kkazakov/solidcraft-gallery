import { randomUUID } from 'node:crypto';
import type { Handle } from '@sveltejs/kit/hooks';

/**
 * Request id + baseline security headers. CSP is added with the auth milestone:
 * SvelteKit's inline bootstrap script needs a nonce, and a half-configured CSP
 * that breaks the app is worse than none for the scaffold.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const requestId = event.request.headers.get('x-request-id')?.slice(0, 128) ?? randomUUID();
  event.locals.requestId = requestId;

  const response = await resolve(event);
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
