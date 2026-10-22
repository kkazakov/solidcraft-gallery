import { describe, expect, it } from 'vitest';
import { hashSessionToken, newSessionToken, sessionCookieName } from '../src/session.js';

describe('session tokens', () => {
  it('produces 256 bits of URL-safe randomness', () => {
    const token = newSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newSessionToken()).not.toBe(token);
  });

  it('hashes deterministically to 32 bytes', () => {
    const token = 'example-token';
    const a = hashSessionToken(token);
    const b = hashSessionToken(token);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    expect(hashSessionToken('other')).not.toEqual(a);
  });

  it('uses a host-only cookie name in production', () => {
    expect(sessionCookieName(true)).toBe('__Host-gallery_session');
    expect(sessionCookieName(false)).toBe('gallery_session');
  });
});
