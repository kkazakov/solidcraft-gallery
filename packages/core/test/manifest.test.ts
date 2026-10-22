import { describe, expect, it } from 'vitest';
import { parseProjectManifest } from '../src/manifest.js';

const valid = {
  schema: 1,
  title: 'Raspberry Pi 4 case',
  description: 'Snap-fit enclosure.',
  tags: ['enclosure', 'raspberry-pi'],
  license: 'CC-BY-4.0',
  design: 'designs/case.solidcraft',
  authors: [{ name: 'Jane Doe', url: 'https://example.com/jane' }],
  links: { website: 'https://example.com' },
};

describe('parseProjectManifest', () => {
  it('accepts the documented shape', () => {
    const result = parseProjectManifest(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe(valid.title);
  });

  it('requires a title', () => {
    const result = parseProjectManifest({ schema: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some((issue) => issue.path === 'title')).toBe(true);
  });

  it('rejects unknown fields rather than dropping them', () => {
    const result = parseProjectManifest({ ...valid, permission: 'everything' });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate tags and bad tag shapes', () => {
    expect(parseProjectManifest({ ...valid, tags: ['case', 'case'] }).ok).toBe(false);
    expect(parseProjectManifest({ ...valid, tags: ['Case'] }).ok).toBe(false);
    expect(parseProjectManifest({ ...valid, tags: ['a'.repeat(33)] }).ok).toBe(false);
  });

  it('rejects a non-https link', () => {
    expect(parseProjectManifest({ ...valid, links: { website: 'http://example.com' } }).ok).toBe(false);
  });

  it('rejects a design path without the extension', () => {
    expect(parseProjectManifest({ ...valid, design: 'designs/case.step' }).ok).toBe(false);
  });
});
