import { describe, expect, it } from 'vitest';
import { isValidSlug, nextAvailableSlug, slugify } from '../src/slug.js';

describe('slugify', () => {
  it('produces lowercase kebab-case', () => {
    expect(slugify('Raspberry Pi 4 Case')).toBe('raspberry-pi-4-case');
  });

  it('strips diacritics instead of dropping the word', () => {
    expect(slugify('Brackét')).toBe('bracket');
    expect(slugify('Čep')).toBe('cep');
  });

  it('falls back when nothing useful remains', () => {
    expect(slugify('!!!')).toBe('project');
    expect(slugify('  x  ')).toBe('project');
  });

  it('truncates without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(200));
    expect(slug).toHaveLength(64);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('does not produce reserved names', () => {
    expect(isValidSlug('search')).toBe(false);
    expect(isValidSlug('u')).toBe(false);
    expect(isValidSlug('search-project')).toBe(true);
  });
});

describe('isValidSlug', () => {
  it('accepts ordinary slugs', () => {
    expect(isValidSlug('pi-case')).toBe(true);
    expect(isValidSlug('a1')).toBe(false);
    expect(isValidSlug('a-b')).toBe(true);
  });

  it('rejects bad shapes', () => {
    expect(isValidSlug('-abc')).toBe(false);
    expect(isValidSlug('abc-')).toBe(false);
    expect(isValidSlug('ABC')).toBe(false);
    expect(isValidSlug('a_b')).toBe(false);
  });
});

describe('nextAvailableSlug', () => {
  it('returns the base when free', () => {
    expect(nextAvailableSlug('case', [])).toBe('case');
  });

  it('counts up from two', () => {
    expect(nextAvailableSlug('case', ['case'])).toBe('case-2');
    expect(nextAvailableSlug('case', ['case', 'case-2'])).toBe('case-3');
  });
});
