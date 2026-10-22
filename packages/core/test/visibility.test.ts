import { describe, expect, it } from 'vitest';
import { can, canChangeVisibility, type ProjectAccess, type Viewer } from '../src/visibility.js';

const owner: Viewer = { id: 'owner', role: 'user' };
const other: Viewer = { id: 'other', role: 'user' };
const admin: Viewer = { id: 'admin', role: 'admin' };

function project(overrides: Partial<ProjectAccess> = {}): ProjectAccess {
  return { ownerId: 'owner', visibility: 'public', status: 'ready', ...overrides };
}

describe('can', () => {
  it('lets anyone view a ready public project', () => {
    expect(can(project(), null, 'view')).toBe(true);
    expect(can(project({ visibility: 'unlisted' }), null, 'view')).toBe(true);
  });

  it('hides private and not-ready projects from anonymous visitors', () => {
    expect(can(project({ visibility: 'private' }), null, 'view')).toBe(false);
    expect(can(project({ status: 'indexing' }), other, 'view')).toBe(false);
  });

  it('shows a private or quarantined project to its owner', () => {
    expect(can(project({ visibility: 'private' }), owner, 'view')).toBe(true);
    expect(can(project({ status: 'quarantined' }), owner, 'view')).toBe(true);
    expect(can(project({ status: 'quarantined' }), other, 'view')).toBe(false);
  });

  it('limits editing to the owner (and admins)', () => {
    expect(can(project(), owner, 'edit')).toBe(true);
    expect(can(project(), other, 'edit')).toBe(false);
    expect(can(project(), admin, 'edit')).toBe(true);
  });

  it('does not let the owner publish a quarantined project', () => {
    expect(can(project({ status: 'quarantined' }), owner, 'publish')).toBe(false);
  });

  it('treats download like view', () => {
    expect(can(project({ visibility: 'private' }), null, 'download')).toBe(false);
    expect(can(project({ visibility: 'private' }), owner, 'download')).toBe(true);
  });
});

describe('canChangeVisibility', () => {
  it('requires a ready version and a license to go public', () => {
    expect(canChangeVisibility({ from: 'private', to: 'public', hasReadyVersion: false, license: 'MIT' })).toEqual({
      ok: false,
      reason: 'a public project needs a ready version',
    });
    expect(canChangeVisibility({ from: 'private', to: 'public', hasReadyVersion: true, license: null })).toEqual({
      ok: false,
      reason: 'a public project needs an SPDX license',
    });
    expect(canChangeVisibility({ from: 'private', to: 'public', hasReadyVersion: true, license: 'MIT' })).toEqual({
      ok: true,
    });
  });

  it('allows narrowing without conditions', () => {
    expect(canChangeVisibility({ from: 'public', to: 'unlisted', hasReadyVersion: false, license: null })).toEqual({
      ok: true,
    });
  });
});
