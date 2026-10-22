import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { AppError } from '@gallery/core';
import { isLean, leanDesign, readDesign } from '../src/index.js';

function container(extra: Record<string, Uint8Array> = {}): Uint8Array {
  return zipSync({
    'container.json': strToU8(JSON.stringify({ format: 'solidcraft-container/1' })),
    'document.json': strToU8(JSON.stringify({ name: 'Bracket', features: [] })),
    ...extra,
  });
}

describe('readDesign', () => {
  it('reads a container', () => {
    const read = readDesign(container());
    expect(read.kind).toBe('container');
    expect(read.hasCache).toBe(false);
    expect(read.document).toEqual({ name: 'Bracket', features: [] });
  });

  it('reads a JSON design', () => {
    const bytes = strToU8(JSON.stringify({ name: 'Plain', features: [] }));
    const read = readDesign(bytes);
    expect(read.kind).toBe('json');
    expect(read.entries).toEqual([]);
  });

  it('rejects a missing document', () => {
    const bytes = zipSync({ 'container.json': strToU8('{"format":"solidcraft-container/1"}') });
    expect(() => readDesign(bytes)).toThrowError(AppError);
  });

  it('rejects the wrong container format', () => {
    const bytes = zipSync({
      'container.json': strToU8('{"format":"other/1"}'),
      'document.json': strToU8('{}'),
    });
    expect(() => readDesign(bytes)).toThrowError(/solidcraft-container\/1/);
  });

  it('rejects an unsafe entry name', () => {
    const bytes = zipSync({
      'container.json': strToU8('{"format":"solidcraft-container/1"}'),
      'document.json': strToU8('{}'),
      '../escape': strToU8('x'),
    });
    expect(() => readDesign(bytes)).toThrowError(/unsafe/);
  });

  it('rejects oversized input before parsing', () => {
    expect(() => readDesign(new Uint8Array(26 * 1024 * 1024))).toThrowError(/larger than/);
  });
});

describe('leanDesign', () => {
  it('removes cache entries and keeps everything else', () => {
    const original = container({
      'cache/model.json': strToU8('{"model":1}'),
      'cache/bodies.bin': strToU8('bodies'),
      'blobs/aaa.step': strToU8('STEP'),
    });

    expect(isLean(original)).toBe(false);
    const lean = leanDesign(original);
    expect(isLean(lean)).toBe(true);

    const entries = Object.keys(unzipSync(lean));
    expect(entries).toEqual(['container.json', 'document.json', 'blobs/aaa.step']);
  });

  it('returns the same bytes when there is no cache', () => {
    const original = container();
    expect(leanDesign(original)).toBe(original);
  });

  it('returns JSON designs unchanged', () => {
    const original = strToU8('{"name":"Plain"}');
    expect(leanDesign(original)).toBe(original);
  });
});
