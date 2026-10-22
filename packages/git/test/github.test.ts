import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@gallery/core';
import { GitHubClient, parseGitHubUrl } from '../src/github.js';

const sha = 'c'.repeat(40);
let server: Server;
let client: GitHubClient;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', base);
    const path = url.pathname;

    if (path === '/api/repos/jane/pi-case') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 42,
          full_name: 'jane/pi-case',
          default_branch: 'main',
          private: false,
          size: 120,
          description: 'A case',
          html_url: 'https://github.com/jane/pi-case',
          owner: { login: 'jane' },
          name: 'pi-case',
        }),
      );
      return;
    }
    if (path === '/api/repos/jane/pi-case/commits/main') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          sha,
          commit: { message: 'Publish v1', author: { name: 'Jane', date: '2026-10-01T10:00:00Z' } },
        }),
      );
      return;
    }
    if (path === `/api/repos/jane/pi-case/git/trees/${sha}`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          truncated: false,
          tree: [
            { path: 'project.json', type: 'blob', size: 100 },
            { path: 'designs/case.solidcraft', type: 'blob', size: 10 },
          ],
        }),
      );
      return;
    }
    if (path === `/api/repos/jane/truncated/git/trees/${sha}`) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ truncated: true, tree: [] }));
      return;
    }
    if (path === '/api/repos/jane/big') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 43,
          full_name: 'jane/big',
          default_branch: 'main',
          private: false,
          size: 2 * 1024 * 1024,
          owner: { login: 'jane' },
          name: 'big',
        }),
      );
      return;
    }
    if (path === '/api/repos/jane/private') {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not Found' }));
      return;
    }
    if (path === `/raw/jane/pi-case/${sha}/designs/case.solidcraft`) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ message: 'Not Found' }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
  client = new GitHubClient({
    apiBase: `${base}/api/`,
    rawBase: `${base}/raw/`,
    fetchImpl: fetch,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('parseGitHubUrl', () => {
  it('normalizes a repository URL and strips .git', () => {
    expect(parseGitHubUrl('https://github.com/jane/pi-case.git')).toEqual({
      owner: 'jane',
      repo: 'pi-case',
      url: 'https://github.com/jane/pi-case',
    });
  });

  it('rejects credentials, other hosts and deep paths', () => {
    expect(() => parseGitHubUrl('http://github.com/jane/pi-case')).toThrow(/https/);
    expect(() => parseGitHubUrl('https://user:pass@github.com/jane/pi-case')).toThrow(/credentials/);
    expect(() => parseGitHubUrl('https://gitlab.com/jane/pi-case')).toThrow(/github.com/);
    expect(() => parseGitHubUrl('https://github.com/jane/pi-case/tree/main')).toThrow(/owner\/repo/);
  });
});

describe('GitHubClient', () => {
  it('reads metadata, commit, tree and a raw file', async () => {
    const ref = parseGitHubUrl('https://github.com/jane/pi-case');
    const repo = await client.repo(ref);
    expect(repo).toMatchObject({ id: '42', defaultBranch: 'main', private: false, description: 'A case' });

    const commit = await client.commit(ref, repo.defaultBranch);
    expect(commit.sha).toBe(sha);
    expect(commit.message).toBe('Publish v1');
    expect(commit.authorName).toBe('Jane');

    const tree = await client.tree(ref, commit.sha);
    expect(tree.map((entry) => entry.path)).toEqual(['project.json', 'designs/case.solidcraft']);

    const file = await client.file(ref, commit.sha, 'designs/case.solidcraft');
    expect(Array.from(file)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('maps a missing repository to not_found', async () => {
    const ref = parseGitHubUrl('https://github.com/jane/private');
    await expect(client.repo(ref)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects a repository over the 1 GB limit', async () => {
    const ref = parseGitHubUrl('https://github.com/jane/big');
    await expect(client.repo(ref)).rejects.toMatchObject({ code: 'payload_too_large' });
  });

  it('rejects a truncated tree', async () => {
    const ref = parseGitHubUrl('https://github.com/jane/truncated');
    await expect(client.tree(ref, sha)).rejects.toMatchObject({ code: 'payload_too_large' });
  });

  it('enforces the design size cap before buffering', async () => {
    const small = new GitHubClient({
      apiBase: `${base}/api/`,
      rawBase: `${base}/raw/`,
      fetchImpl: fetch,
      maxFileBytes: 4,
    });
    const ref = parseGitHubUrl('https://github.com/jane/pi-case');
    await expect(small.file(ref, sha, 'designs/case.solidcraft')).rejects.toMatchObject({
      code: 'payload_too_large',
    });
  });

  it('uses AppError for all failures', async () => {
    const ref = parseGitHubUrl('https://github.com/jane/private');
    try {
      await client.repo(ref);
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
    }
  });
});
