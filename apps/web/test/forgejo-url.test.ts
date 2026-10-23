import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { forgejoPublicUrl } from '../src/lib/server/forgejo.js';

const KEYS = ['FORGEJO_PUBLIC_URL', 'FORGEJO_URL'] as const;
const ORIGINAL = Object.fromEntries(KEYS.map((key) => [key, process.env[key]])) as Record<
  (typeof KEYS)[number],
  string | undefined
>;

beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of KEYS) {
    const value = ORIGINAL[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('forgejoPublicUrl', () => {
  it('prefers the explicit public URL over the legacy FORGEJO_URL', () => {
    process.env.FORGEJO_PUBLIC_URL = 'https://forgejo.example';
    process.env.FORGEJO_URL = 'https://internal.example';
    expect(forgejoPublicUrl()).toBe('https://forgejo.example');
  });

  it('falls back to FORGEJO_URL, which compose sets to the public URL', () => {
    process.env.FORGEJO_URL = 'https://forgejo.example';
    expect(forgejoPublicUrl()).toBe('https://forgejo.example');
  });

  it('strips the trailing slash of the configured root URL', () => {
    process.env.FORGEJO_PUBLIC_URL = 'https://forgejo.example/';
    expect(forgejoPublicUrl()).toBe('https://forgejo.example');
  });

  it('trims surrounding whitespace and ignores blank values', () => {
    process.env.FORGEJO_PUBLIC_URL = '  ';
    process.env.FORGEJO_URL = ' https://forgejo.example/ ';
    expect(forgejoPublicUrl()).toBe('https://forgejo.example');
  });

  it('returns null when Forgejo is not configured', () => {
    expect(forgejoPublicUrl()).toBeNull();
  });
});
