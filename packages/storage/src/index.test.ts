import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorage, artifactKey, sha256Hex } from './index.js';

let root: string;
let storage: LocalStorage;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gallery-storage-'));
  storage = new LocalStorage(root);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalStorage', () => {
  it('writes and reads a content-addressed artifact', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const sha = sha256Hex(bytes);
    const key = artifactKey(sha, 'iso.png');
    const stored = await storage.put(key, bytes);
    expect(stored.sha256).toBe(sha);
    expect(Array.from(await storage.get(key))).toEqual([1, 2, 3, 4]);
    expect(await storage.has(key)).toBe(true);
  });

  it('is idempotent and rejects unsafe keys', async () => {
    const key = artifactKey(sha256Hex(new Uint8Array([9])), 'a.png');
    await storage.put(key, new Uint8Array([9]));
    await expect(storage.put(key, new Uint8Array([9]))).resolves.toMatchObject({ key });
    expect(() => storage.abs('../escape')).toThrow(/unsafe/);
    expect(() => storage.abs('/etc/passwd')).toThrow(/unsafe/);
    expect(() => artifactKey('not-a-hash', 'a.png')).toThrow();
  });
});
