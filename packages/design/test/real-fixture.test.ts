import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { isLean, leanDesign, readDesign } from '../src/index.js';

const fixture = fileURLToPath(new URL('../../../fixtures/real/box.solidcraft', import.meta.url));

describe('real SolidCraft fixture', () => {
  it('reads a real SolidCraft container', async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const read = readDesign(bytes);
    expect(read.kind).toBe('container');
    expect(read.hasCache).toBe(true);
    expect((read.document as { name?: string }).name).toBe('box');
  });

  it('strips the real model cache', async () => {
    const bytes = new Uint8Array(await readFile(fixture));
    const lean = leanDesign(bytes);
    expect(isLean(lean)).toBe(true);
    expect(lean.byteLength).toBeLessThan(bytes.byteLength);
    expect((readDesign(lean).document as { name?: string }).name).toBe('box');
  });
});
