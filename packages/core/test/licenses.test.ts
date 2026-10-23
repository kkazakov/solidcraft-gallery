import { describe, expect, it } from 'vitest';
import { COMMON_LICENSES, isCommonLicense } from '../src/licenses.js';

describe('common licenses', () => {
  it('mirrors GitHub’s 13 commonly used licenses', () => {
    expect(COMMON_LICENSES).toHaveLength(13);
    expect(new Set(COMMON_LICENSES.map((license) => license.id)).size).toBe(13);
    expect(COMMON_LICENSES.map((license) => license.id)).toEqual(
      expect.arrayContaining(['AGPL-3.0', 'Apache-2.0', 'BSD-3-Clause', 'CC0-1.0', 'GPL-3.0', 'MIT', 'MPL-2.0']),
    );
  });

  it('validates by SPDX id', () => {
    expect(isCommonLicense('MIT')).toBe(true);
    expect(isCommonLicense('Unlicense')).toBe(true);
    expect(isCommonLicense('WTFPL')).toBe(false);
    expect(isCommonLicense('')).toBe(false);
  });
});
