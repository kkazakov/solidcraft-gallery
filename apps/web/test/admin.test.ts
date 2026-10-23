import { describe, expect, it } from 'vitest';
import {
  inviteExpiry,
  inviteState,
  pageCount,
  pageOffset,
  parseInviteForm,
  parsePage,
  registrationUrl,
} from '../src/lib/server/admin.js';
import { decodeInviteFlash, encodeInviteFlash } from '../src/lib/server/invite-flash.js';

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe('admin pagination', () => {
  it('clamps page parameters to a positive, bounded page', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage(null)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-4')).toBe(1);
    expect(parsePage('abc')).toBe(1);
    expect(parsePage('999999')).toBe(10_000);
  });

  it('computes page counts and offsets', () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(41, 20)).toBe(3);
    expect(pageOffset(1, 20)).toBe(0);
    expect(pageOffset(3, 20)).toBe(40);
  });
});

describe('invite form validation', () => {
  it('accepts a bounded code with an optional note', () => {
    expect(parseInviteForm(form({ uses: '5', days: '14', note: '  Ana  ' }))).toEqual({
      ok: true,
      value: { uses: 5, days: 14, note: 'Ana' },
    });
    expect(parseInviteForm(form({ uses: '1', days: '1' }))).toEqual({
      ok: true,
      value: { uses: 1, days: 1, note: '' },
    });
  });

  it('rejects fractional, missing and out-of-range numbers', () => {
    for (const uses of ['', '0', '-1', '1.5', '1001', 'lots']) {
      expect(parseInviteForm(form({ uses, days: '14' }))).toMatchObject({ ok: false, error: 'uses' });
    }
    for (const days of ['', '0', '-1', '2.5', '366', 'soon']) {
      expect(parseInviteForm(form({ uses: '1', days }))).toMatchObject({ ok: false, error: 'days' });
    }
  });

  it('caps the note at 200 characters and keeps values on failure', () => {
    const result = parseInviteForm(form({ uses: '2', days: '7', note: 'x'.repeat(201) }));
    expect(result).toEqual({
      ok: false,
      error: 'note',
      values: { uses: '2', days: '7', note: 'x'.repeat(201) },
    });
  });
});

describe('invite state', () => {
  const now = new Date('2026-10-23T12:00:00Z');
  const base = { uses: 0, maxUses: 2, expiresAt: null, revokedAt: null };

  it('derives active, expired, exhausted and revoked states', () => {
    expect(inviteState(base, now)).toBe('active');
    expect(inviteState({ ...base, uses: 2 }, now)).toBe('exhausted');
    expect(inviteState({ ...base, expiresAt: new Date('2026-10-23T11:59:00Z') }, now)).toBe('expired');
    expect(inviteState({ ...base, revokedAt: new Date('2026-10-23T10:00:00Z') }, now)).toBe('revoked');
    expect(inviteState({ ...base, revokedAt: new Date('2026-10-23T10:00:00Z'), uses: 2 }, now)).toBe('revoked');
  });

  it('adds whole days to the current instant', () => {
    expect(inviteExpiry(2, now.getTime())).toEqual(new Date('2026-10-25T12:00:00Z'));
  });
});

describe('registration link', () => {
  it('encodes codes into the registration query string', () => {
    expect(registrationUrl('a b/c')).toBe('/auth/register?invite=a%20b%2Fc');
  });
});

describe('one-time invite flash', () => {
  it('round-trips the code and survives until its expiry', () => {
    const raw = encodeInviteFlash({ code: 'secret-code', uses: 2, days: 7 }, 1_000);
    expect(decodeInviteFlash(raw, 1_000)).toMatchObject({
      code: 'secret-code',
      uses: 2,
      days: 7,
      exp: 61_000,
    });
    expect(decodeInviteFlash(raw, 61_001)).toBeNull();
  });

  it('rejects tampered and malformed payloads', () => {
    const raw = encodeInviteFlash({ code: 'secret-code', uses: 1, days: 14 }, 1_000);
    const [body, signature] = raw.split('.');
    expect(decodeInviteFlash(`${body}x.${signature}`, 1_000)).toBeNull();
    expect(decodeInviteFlash(`${body}.${signature}x`, 1_000)).toBeNull();
    expect(decodeInviteFlash('not-a-flash', 1_000)).toBeNull();
    expect(decodeInviteFlash('a.b.c', 1_000)).toBeNull();
  });
});
