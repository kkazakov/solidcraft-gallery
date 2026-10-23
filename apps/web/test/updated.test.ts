import { describe, expect, it } from 'vitest';
import { formatUpdatedAt, siteBuiltAt } from '../src/lib/server/updated.js';

describe('formatUpdatedAt', () => {
  it('renders the time first and the zone abbreviation', () => {
    expect(formatUpdatedAt(new Date('2026-10-23T09:55:00Z'), 'UTC')).toBe('09:55 UTC, 23 Oct 2026');
  });

  it('follows summer and winter time in a named zone', () => {
    expect(formatUpdatedAt(new Date('2026-10-23T09:55:00Z'), 'Europe/Berlin')).toBe('11:55 CEST, 23 Oct 2026');
    expect(formatUpdatedAt(new Date('2026-01-15T09:55:00Z'), 'Europe/Berlin')).toBe('10:55 CET, 15 Jan 2026');
  });

  it('pads the clock but not the day', () => {
    expect(formatUpdatedAt(new Date('2026-03-02T04:05:00Z'), 'UTC')).toBe('04:05 UTC, 2 Mar 2026');
  });
});

describe('siteBuiltAt', () => {
  it('returns a valid instant for the running build', () => {
    expect(Number.isNaN(siteBuiltAt().getTime())).toBe(false);
  });
});
