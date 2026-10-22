import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGitBackend, type LocalRepo } from '../src/local.js';

let root: string;
let backend: LocalGitBackend;
let repo: LocalRepo;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'gallery-git-'));
  backend = new LocalGitBackend(root);
  repo = await backend.createRepo({ owner: 'jane', slug: 'pi-case', title: 'Pi case' });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('LocalGitBackend', () => {
  it('creates a real repository with an initial commit', async () => {
    const head = await backend.head({ repo });
    expect(head).toMatch(/^[0-9a-f]{40}$/);
    const readme = await backend.readFile({ repo, commit: head, path: 'README.md' });
    expect(Buffer.from(readme).toString()).toContain('Pi case');
  });

  it('commits files and reads them at the commit', async () => {
    const design = new Uint8Array([1, 2, 3, 4]);
    const result = await backend.commitFiles({
      repo,
      files: { 'designs/case.solidcraft': design, 'project.json': '{"schema":1,"title":"Pi"}' },
      message: 'Publish v1',
    });
    expect(result.commit).toMatch(/^[0-9a-f]{40}$/);

    const read = await backend.readFile({ repo, commit: result.commit, path: 'designs/case.solidcraft' });
    expect(Array.from(read)).toEqual([1, 2, 3, 4]);
  });

  it('returns the current commit when nothing changed', async () => {
    const first = await backend.commitFiles({ repo, files: { 'a.txt': 'a' }, message: 'one' });
    const second = await backend.commitFiles({ repo, files: { 'a.txt': 'a' }, message: 'two' });
    expect(second.commit).toBe(first.commit);
  });

  it('tags a commit and rejects an invalid tag', async () => {
    const commit = await backend.commitFiles({ repo, files: { 'a.txt': 'a' }, message: 'one' });
    await backend.tag({ repo, commit: commit.commit, tag: 'v1.0.0' });
    await expect(backend.tag({ repo, commit: commit.commit, tag: 'bad tag' })).rejects.toThrow(/invalid tag/);
  });

  it('rejects path traversal and invalid names', async () => {
    await expect(backend.commitFiles({ repo, files: { '../escape': 'x' }, message: 'bad' })).rejects.toThrow(/unsafe/);
    expect(() => new LocalGitBackend(root)).not.toThrow();
    await expect(backend.createRepo({ owner: '../jane', slug: 'x', title: 'x' })).rejects.toThrow(/invalid/);
  });
});
