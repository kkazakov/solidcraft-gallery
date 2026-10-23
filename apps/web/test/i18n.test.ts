import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LOCALE,
  isLocale,
  normalizeLocale,
  preferredLocaleFromHeader,
  resolveLocale,
} from '../src/lib/i18n/config.js';
import { bg } from '../src/lib/i18n/bg.js';
import { en } from '../src/lib/i18n/en.js';
import { translate, translateEnum, translatePlural } from '../src/lib/i18n/messages.js';
import { POST } from '../src/routes/language/+server.js';

describe('locale resolution', () => {
  it('normalizes regions, underscores and case', () => {
    expect(normalizeLocale('bg')).toBe('bg');
    expect(normalizeLocale('bg-BG')).toBe('bg');
    expect(normalizeLocale('BG_bg')).toBe('bg');
    expect(normalizeLocale(' en-US ')).toBe('en');
    expect(isLocale('bg')).toBe(true);
    expect(isLocale('BG')).toBe(false);
  });

  it('ignores unsupported or empty values', () => {
    expect(normalizeLocale('fr-FR')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
  });

  it('picks the supported language with the highest q-value', () => {
    expect(preferredLocaleFromHeader('bg-BG,bg;q=0.9,en-US;q=0.8,en;q=0.7')).toBe('bg');
    expect(preferredLocaleFromHeader('en;q=0.5, bg;q=0.9')).toBe('bg');
    expect(preferredLocaleFromHeader('fr-FR,de;q=0.8,bg;q=0.4')).toBe('bg');
  });

  it('breaks quality ties by header order', () => {
    expect(preferredLocaleFromHeader('en;q=0.5,bg;q=0.5')).toBe('en');
    expect(preferredLocaleFromHeader('bg;q=0.5,en;q=0.5')).toBe('bg');
  });

  it('treats q=0 as not acceptable', () => {
    expect(preferredLocaleFromHeader('bg;q=0,en;q=0.5')).toBe('en');
    expect(preferredLocaleFromHeader('bg;q=0,fr;q=0.5')).toBeNull();
  });

  it('uses English for a wildcard and for unusable headers', () => {
    expect(preferredLocaleFromHeader('*')).toBe(DEFAULT_LOCALE);
    expect(preferredLocaleFromHeader(null)).toBeNull();
    expect(preferredLocaleFromHeader('de-DE,fr;q=0.8')).toBeNull();
  });

  it('lets the stored preference win over the browser language', () => {
    expect(resolveLocale('bg', 'en-US,en;q=0.9')).toBe('bg');
    expect(resolveLocale('en', 'bg-BG,bg;q=0.9')).toBe('en');
  });

  it('falls back to the header, then English, when the stored value is invalid', () => {
    expect(resolveLocale('fr', 'bg-BG')).toBe('bg');
    expect(resolveLocale(undefined, null)).toBe(DEFAULT_LOCALE);
  });
});

describe('dictionaries', () => {
  it('expose exactly the same keys', () => {
    expect(Object.keys(bg).sort()).toEqual(Object.keys(en).sort());
  });

  it('contain no empty strings', () => {
    for (const [key, value] of Object.entries(bg)) {
      expect(value, key).not.toBe('');
    }
  });
});

describe('translation', () => {
  it('interpolates named parameters and leaves unknown ones intact', () => {
    expect(translate('en', 'project.title', { title: 'Box' })).toBe('Box — SolidCraft Gallery');
    expect(translate('en', 'language.label')).toBe('Language');
    expect(translate('en', 'project.title', { title: 'Box', extra: 'x' })).toBe('Box — SolidCraft Gallery');
  });

  it('uses the plural category and falls back to other', () => {
    expect(translatePlural('en', 'home.publicDesigns', 1)).toBe('1 public design');
    expect(translatePlural('en', 'home.publicDesigns', 2)).toBe('2 public designs');
    expect(translatePlural('bg', 'home.publicDesigns', 3)).toBe('3 public designs');
  });

  it('translates known enum values and preserves unknown ones', () => {
    expect(translateEnum('en', 'visibility', 'private')).toBe('Private');
    expect(translateEnum('en', 'status', 'ready')).toBe('Ready');
    expect(translateEnum('en', 'status', 'brand-new')).toBe('brand-new');
  });
});

describe('POST /language', () => {
  function event(language: string, redirect = '/dashboard') {
    return {
      request: new Request('http://localhost/language', {
        method: 'POST',
        headers: { origin: 'http://localhost' },
        body: new URLSearchParams({ language, redirect }),
      }),
      cookies: { set: vi.fn() },
      url: new URL('http://localhost/language'),
    } as never;
  }

  it('stores the preference in a readable cookie and redirects back', async () => {
    const cookies = { set: vi.fn() };
    const request = new Request('http://localhost/language', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: new URLSearchParams({ language: 'bg', redirect: '/dashboard/projects/1?tab=versions' }),
    });

    await expect(POST({ request, cookies, url: new URL('http://localhost/language') } as never)).rejects.toMatchObject({
      status: 303,
      location: '/dashboard/projects/1?tab=versions',
    });
    expect(cookies.set).toHaveBeenCalledWith(
      'gallery-language',
      'bg',
      expect.objectContaining({ path: '/', httpOnly: false, sameSite: 'lax' }),
    );
  });

  it('rejects unsupported locales', async () => {
    await expect(POST(event('fr'))).rejects.toMatchObject({ status: 400 });
  });

  it('refuses to redirect to another origin', async () => {
    await expect(POST(event('bg', 'https://evil.example/steal'))).rejects.toMatchObject({
      status: 303,
      location: '/dashboard',
    });
    await expect(POST(event('bg', '//evil.example/steal'))).rejects.toMatchObject({
      status: 303,
      location: '/dashboard',
    });
  });
});
