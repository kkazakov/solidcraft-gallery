import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  ensureDevUser,
  findProjectById,
  findVersionById,
  listVersions,
  type Database,
} from '@gallery/db';
import { leanDesign } from '@gallery/design';
import { GitHubClient } from '@gallery/git';
import { LocalStorage } from '@gallery/storage';
import { connectGitHubRepo, syncGitHubProject } from '../src/lib/server/external.js';

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? describe : describe.skip;
const fixture = fileURLToPath(new URL('../../../fixtures/real/box.solidcraft', import.meta.url));
const stamp = Date.now().toString(36);

maybe('external GitHub source (integration)', () => {
  let server: Server;
  let db: Database;
  let root: string;
  let storage: LocalStorage;
  let github: GitHubClient;
  let base: string;
  let userId: string;
  let design: Uint8Array;
  let projectJson: Uint8Array;
  let head = 'd'.repeat(40);

  beforeAll(async () => {
    db = createDatabase(databaseUrl!, { max: 2 });
    const user = await ensureDevUser(db, `external-${stamp}`);
    userId = user.id;
    root = await mkdtemp(join(tmpdir(), 'gallery-external-'));
    storage = new LocalStorage(join(root, 'artifacts'));
    design = new Uint8Array(await readFile(fixture));
    projectJson = new TextEncoder().encode(
      JSON.stringify({
        schema: 1,
        title: 'Pi Case',
        description: 'A snap-fit case',
        license: 'CC0-1.0',
        design: 'designs/case.solidcraft',
        tags: ['enclosure'],
      }),
    );

    server = createServer((req, res) => {
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === '/api/repos/jane/pi-case') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 77,
            name: 'pi-case',
            full_name: 'jane/pi-case',
            html_url: 'https://github.com/jane/pi-case',
            default_branch: 'main',
            private: false,
            size: 12,
            description: 'A case',
            owner: { login: 'jane' },
          }),
        );
        return;
      }
      if (path === '/api/repos/jane/pi-case/commits/main') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            sha: head,
            commit: { message: 'Publish', author: { name: 'Jane', date: '2026-10-02T10:00:00Z' } },
          }),
        );
        return;
      }
      if (path === `/api/repos/jane/pi-case/git/trees/${head}`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            truncated: false,
            tree: [
              { path: 'project.json', type: 'blob', size: projectJson.byteLength },
              { path: 'designs/case.solidcraft', type: 'blob', size: design.byteLength },
            ],
          }),
        );
        return;
      }
      if (path === `/raw/jane/pi-case/${head}/project.json`) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(Buffer.from(projectJson));
        return;
      }
      if (path === `/raw/jane/pi-case/${head}/designs/case.solidcraft`) {
        res.writeHead(200, { 'content-type': 'application/octet-stream' });
        res.end(Buffer.from(design));
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not Found' }));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    github = new GitHubClient({ apiBase: `${base}/api/`, rawBase: `${base}/raw/`, fetchImpl: fetch });
  }, 120_000);

  afterAll(async () => {
    if (userId) await db`delete from users where id = ${userId}`;
    await db.end({ timeout: 5 });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(root, { recursive: true, force: true });
  });

  it('connects, caches the lean design, and syncs a new commit once', async () => {
    const viewer = await db<{ id: string; username: string; role: 'user' }[]>`
      select id, username::text as username, role::text as role from users where id = ${userId}
    `;
    const connected = await connectGitHubRepo(
      { viewer: viewer[0]!, url: 'https://github.com/jane/pi-case' },
      { github, storage },
    );
    expect(connected.title).toBe('Pi Case');

    const project = await findProjectById(db, connected.projectId);
    expect(project).toMatchObject({
      repoProvider: 'github',
      visibility: 'private',
      status: 'pending',
      designPath: 'designs/case.solidcraft',
      license: 'CC0-1.0',
    });

    const versions = await listVersions(db, connected.projectId);
    expect(versions).toHaveLength(1);
    expect(versions[0]!.commitSha).toBe(head);
    expect(versions[0]!.designKey).toBeTruthy();
    const cached = await storage.get(versions[0]!.designKey!);
    expect(cached.byteLength).toBe(leanDesign(design).byteLength);

    // Same head is a no-op.
    expect(
      await syncGitHubProject({ viewer: viewer[0]!, projectId: connected.projectId }, { github, storage }),
    ).toEqual({
      changed: false,
    });

    head = 'e'.repeat(40);
    const synced = await syncGitHubProject({ viewer: viewer[0]!, projectId: connected.projectId }, { github, storage });
    expect(synced.changed).toBe(true);
    expect(synced.commit).toBe(head);

    const after = await findVersionById(db, synced.versionId!);
    expect(after?.designKey).toBeTruthy();
    expect(await listVersions(db, connected.projectId)).toHaveLength(2);
  }, 120_000);
});
