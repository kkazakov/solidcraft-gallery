import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe. Stored only as a SHA-256 hash. */
export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): Uint8Array {
  return createHash('sha256').update(token).digest();
}

/** `__Host-` requires Secure and no Domain; use the plain name in local dev. */
export function sessionCookieName(production: boolean): string {
  return production ? '__Host-gallery_session' : 'gallery_session';
}
