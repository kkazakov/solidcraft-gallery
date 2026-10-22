import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForgejoClient } from '../src/forgejo.js';

const token = 'admin-token';
let server: Server;
let client: ForgejoClient;
let base = '';
let privateFlag = true;
let tagName = '';
let collaborator = '';
const files = new Map<string, { sha: string; content: string }>();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString();
}

beforeAll(async () => {
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base);
      const path = url.pathname;
      if (req.headers.authorization !== `token ${token}`) {
        json(res, 401, { message: 'unauthorized' });
        return;
      }

      if (req.method === 'POST' && path === '/api/v1/user/repos') {
        const body = JSON.parse(await readBody(req)) as { name: string };
        json(res, 201, {
          id: 9,
          name: body.name,
          full_name: `admin/${body.name}`,
          html_url: `http://forgejo.test/admin/${body.name}`,
          default_branch: 'main',
          private: true,
          owner: { login: 'admin' },
        });
        return;
      }
      if (req.method === 'PUT' && path.startsWith('/api/v1/repos/admin/pi-case/collaborators/')) {
        collaborator = decodeURIComponent(path.split('/').pop()!);
        res.writeHead(204);
        res.end();
        return;
      }
      if (path.startsWith('/api/v1/repos/admin/pi-case/contents/')) {
        const filePath = decodeURIComponent(path.split('/contents/')[1]!);
        if (req.method === 'GET') {
          const existing = files.get(filePath);
          if (!existing) {
            json(res, 404, { message: 'not found' });
            return;
          }
          json(res, 200, { sha: existing.sha });
          return;
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const body = JSON.parse(await readBody(req)) as { content: string };
          const sha = req.method === 'POST' ? '1'.repeat(40) : '2'.repeat(40);
          files.set(filePath, { sha, content: body.content });
          json(res, 200, { commit: { sha } });
          return;
        }
      }
      if (req.method === 'POST' && path === '/api/v1/repos/admin/pi-case/tags') {
        const body = JSON.parse(await readBody(req)) as { tag_name: string };
        tagName = body.tag_name;
        json(res, 201, { name: tagName });
        return;
      }
      if (req.method === 'PATCH' && path === '/api/v1/repos/admin/pi-case') {
        const body = JSON.parse(await readBody(req)) as { private: boolean };
        privateFlag = body.private;
        json(res, 200, { private: privateFlag });
        return;
      }
      json(res, 404, { message: 'not found' });
    })().catch((error) => {
      json(res, 500, { message: String(error) });
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  client = new ForgejoClient({
    baseUrl: base,
    publicUrl: 'https://git.example',
    token,
    fetchImpl: fetch,
  });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('ForgejoClient', () => {
  it('creates a repository and adds a collaborator', async () => {
    const repo = await client.createRepo({ name: 'pi-case', private: true });
    expect(repo).toMatchObject({
      id: '9',
      owner: 'admin',
      name: 'pi-case',
      fullName: 'admin/pi-case',
      url: 'https://git.example/admin/pi-case',
      defaultBranch: 'main',
    });
    await client.addCollaborator('admin', 'pi-case', 'jane');
    expect(collaborator).toBe('jane');
  });

  it('creates then updates a file, decoding base64 content', async () => {
    const content = new TextEncoder().encode('{"schema":1}');
    const created = await client.upsertFile({
      owner: 'admin',
      repo: 'pi-case',
      path: 'project.json',
      content,
      message: 'Publish',
      branch: 'main',
    });
    expect(created.commit).toBe('1'.repeat(40));
    expect(Buffer.from(files.get('project.json')!.content, 'base64').toString()).toBe('{"schema":1}');

    const updated = await client.upsertFile({
      owner: 'admin',
      repo: 'pi-case',
      path: 'project.json',
      content: new TextEncoder().encode('{"schema":2}'),
      message: 'Update',
      branch: 'main',
    });
    expect(updated.commit).toBe('2'.repeat(40));
  });

  it('tags and changes visibility', async () => {
    await client.tag({ owner: 'admin', repo: 'pi-case', name: 'v1.0.0', target: '2'.repeat(40) });
    expect(tagName).toBe('v1.0.0');
    await client.setPrivate('admin', 'pi-case', false);
    expect(privateFlag).toBe(false);
  });

  it('maps a refused request to forbidden', async () => {
    const unauthorized = new ForgejoClient({ baseUrl: base, token: 'wrong', fetchImpl: fetch });
    await expect(unauthorized.repo('admin', 'pi-case')).rejects.toMatchObject({ code: 'forbidden' });
  });
});
