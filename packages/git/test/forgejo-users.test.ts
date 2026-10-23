import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@gallery/core';
import { ForgejoClient } from '../src/forgejo.js';

const token = 'admin-token';
let server: Server;
let client: ForgejoClient;
let base = '';
const users = new Map<string, { id: number; login: string; email: string }>();
let createdBody: Record<string, unknown> | null = null;

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
  users.set('gallery-admin', { id: 1, login: 'gallery-admin', email: 'admin@example.test' });

  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', base);
      const path = url.pathname;

      if (req.headers.authorization !== `token ${token}`) {
        json(res, 401, { message: 'unauthorized' });
        return;
      }

      if (req.method === 'GET' && path.startsWith('/api/v1/users/')) {
        const username = decodeURIComponent(path.slice('/api/v1/users/'.length));
        const user = users.get(username);
        if (!user) {
          json(res, 404, { message: 'not found' });
          return;
        }
        json(res, 200, user);
        return;
      }

      if (req.method === 'POST' && path === '/api/v1/admin/users') {
        createdBody = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const username = String(createdBody.username ?? '');
        const email = String(createdBody.email ?? '');
        if (users.has(username)) {
          json(res, 422, { message: 'user already exists' });
          return;
        }
        if ([...users.values()].some((entry) => entry.email === email)) {
          json(res, 422, { message: 'e-mail already in use' });
          return;
        }
        const user = { id: 77, login: username, email };
        users.set(username, user);
        json(res, 201, user);
        return;
      }

      if (req.method === 'DELETE' && path.startsWith('/api/v1/admin/users/')) {
        const username = decodeURIComponent(path.slice('/api/v1/admin/users/'.length));
        users.delete(username);
        res.writeHead(204).end();
        return;
      }

      json(res, 404, { message: 'not found' });
    })();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  base = `http://127.0.0.1:${address.port}`;
  client = new ForgejoClient({ baseUrl: base, token });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('Forgejo account provisioning', () => {
  it('reports a missing user as free', async () => {
    expect(await client.findUser('alice')).toBeNull();
    expect((await client.findUser('gallery-admin'))?.id).toBe(1);
  });

  it('creates an account without forcing a password change', async () => {
    const user = await client.createUser({
      username: 'alice',
      email: 'alice@example.test',
      password: 'correct horse battery',
    });
    expect(user).toMatchObject({ id: 77, login: 'alice' });
    expect(createdBody).toMatchObject({
      username: 'alice',
      email: 'alice@example.test',
      must_change_password: false,
      send_notify: false,
    });
  });

  it('surfaces Forgejo validation messages instead of a generic error', async () => {
    await expect(
      client.createUser({ username: 'alice', email: 'other@example.test', password: 'longenough' }),
    ).rejects.toMatchObject({ code: 'validation_failed', message: 'user already exists' });

    await expect(
      client.createUser({ username: 'alice', email: 'other@example.test', password: 'longenough' }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      client.createUser({ username: 'bob', email: 'admin@example.test', password: 'longenough' }),
    ).rejects.toMatchObject({ code: 'validation_failed', message: 'e-mail already in use' });
  });

  it('deletes a provisioned account idempotently', async () => {
    await client.deleteUser('alice');
    expect(await client.findUser('alice')).toBeNull();
    await expect(client.deleteUser('alice')).resolves.toBeUndefined();
  });
});
