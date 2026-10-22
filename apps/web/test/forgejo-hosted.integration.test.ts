import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
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
  findRepoById,
  findVersionById,
  listVersions,
  type Database,
} from '@gallery/db';

const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? describe : describe.skip;
const stamp = Date.now().toString(36);
const fixture = fileURLToPath(new URL('../../../fixtures/real/box.solidcraft', import.meta.url));

// Set configuration before importing the service (config.ts captures DATA_DIR).
const root = await mkdtemp(join(tmpdir(), 'gallery-forgejo-it-'));
process.env.DATA_DIR = root;
process.env.FORGEJO_ADMIN_TOKEN = 'admintoken';

const { createHostedProject, publishDesign, applyProjectVisibility } = await import('../src/lib/server/projects.js');

let server: Server;
let db: Database;
let userId: string;
let base = '';
const files = new Map<string, string>();
let privateFlag = true;

function send(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': String(data.length) });
  res.end(data);
}

async function body(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

beforeAll(async () => {
  db = createDatabase(databaseUrl!, { max: 2 });
  const user = await ensureDevUser(db, `forge-${stamp}`);
  userId = user.id;

  server = createServer((req, res) => {
    void (async () => {
      if (req.headers.authorization !== 'token admintoken') {
        send(res, 401, { message: 'unauthorized' });
        return;
      }
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;

      if (req.method === 'POST' && path === '/api/v1/user/repos') {
        const payload = JSON.parse(await body(req)) as { name: string };
        send(res, 201, {
          id: 88,
          name: payload.name,
          full_name: `admin/${payload.name}`,
          html_url: `${base}/admin/${payload.name}`,
          default_branch: 'main',
          private: true,
          owner: { login: 'admin' },
        });
        return;
      }
      if (path.includes('/contents/')) {
        const [prefix, filePath] = path.split('/contents/');
        const repo = prefix!.split('/').pop()!;
        const key = `${repo}:${filePath}`;
        if (req.method === 'GET') {
          send(res, files.has(key) ? 200 : 404, files.has(key) ? { sha: 'a'.repeat(40) } : { message: 'not found' });
          return;
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const payload = JSON.parse(await body(req)) as { content: string };
          files.set(key, Buffer.from(payload.content, 'base64').toString('utf8'));
          send(res, 200, { commit: { sha: 'b'.repeat(40) } });
          return;
        }
      }
      if (req.method === 'POST' && path.endsWith('/tags')) {
        send(res, 201, { name: 'v1.0.0' });
        return;
      }
      if (req.method === 'PATCH' && path.startsWith('/api/v1/repos/admin/')) {
        const payload = JSON.parse(await body(req)) as { private?: boolean };
        privateFlag = payload.private !== false;
        send(res, 200, { private: privateFlag });
        return;
      }
      if (req.method === 'PUT' && path.includes('/collaborators/')) {
        res.writeHead(204);
        res.end();
        return;
      }
      send(res, 404, { message: 'not found' });
    })().catch((error) => send(res, 500, { message: String(error) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.FORGEJO_INTERNAL_URL = base;
  process.env.FORGEJO_PUBLIC_URL = base;
}, 120_000);

afterAll(async () => {
  if (userId) await db`delete from users where id = ${userId}`;
  await db.end({ timeout: 5 });
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  await rm(root, { recursive: true, force: true });
});

maybe('Forgejo hosted projects (integration)', () => {
  it('creates a repository, publishes files and applies visibility', async () => {
    const viewer = await db<{ id: string; username: string; role: 'user' }[]>`
      select id, username::text as username, role::text as role from users where id = ${userId}
    `;
    const project = await createHostedProject({
      viewer: viewer[0]!,
      title: 'Forge Test',
      slug: `forge-${stamp}`,
    });

    const stored = await findProjectById(db, project.id);
    expect(stored).toMatchObject({
      repoProvider: 'forgejo',
      visibility: 'private',
      designPath: `designs/forge-${stamp}.solidcraft`,
    });

    const design = new Uint8Array(await readFile(fixture));
    const published = await publishDesign({
      viewer: viewer[0]!,
      projectId: project.id,
      bytes: design,
      tag: 'v1.0.0',
    });
    expect(published.commit).toBe('b'.repeat(40));

    const versions = await listVersions(db, project.id);
    expect(versions).toHaveLength(1);
    expect(await findVersionById(db, versions[0]!.id)).toMatchObject({ status: 'pending' });
    expect(versions[0]!.designKey).toBeTruthy();
    expect(files.get(`forge-${stamp}:project.json`)).toContain('"title": "Forge Test"');

    await applyProjectVisibility(stored!, 'public', 'CC0-1.0');
    expect(privateFlag).toBe(false);
    expect((await findProjectById(db, project.id))?.visibility).toBe('public');
    const repo = await findRepoById(db, stored!.repoId);
    expect(repo?.isPrivate).toBe(false);
  }, 120_000);
});
