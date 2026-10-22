import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@gallery/core';
import {
  decodeTransaction,
  encodeTransaction,
  exchangeCode,
  fetchProfile,
  pkceChallenge,
  providerConfig,
  safeRedirect,
  type OAuthProviderConfig,
} from '../src/lib/server/oauth.js';

process.env.SESSION_SECRET = 'test-secret-with-enough-entropy';
let server: Server;
let base = '';
let tokenRequest: URLSearchParams | null = null;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/token') {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        tokenRequest = new URLSearchParams(Buffer.concat(chunks).toString());
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ access_token: 'token-123', token_type: 'bearer' }));
      });
      return;
    }
    if (req.url === '/user') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 7,
          login: 'jane',
          full_name: 'Jane Doe',
          email: 'jane@example.test',
          avatar_url: 'https://example.test/avatar.png',
        }),
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

describe('PKCE and redirects', () => {
  it('matches the RFC 7636 example', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('only accepts absolute paths for post-login redirects', () => {
    expect(safeRedirect('/dashboard')).toBe('/dashboard');
    expect(safeRedirect('/projects?x=1')).toBe('/projects?x=1');
    expect(safeRedirect('https://evil.example')).toBe('/dashboard');
    expect(safeRedirect('//evil.example')).toBe('/dashboard');
    expect(safeRedirect('/\\evil')).toBe('/dashboard');
    expect(safeRedirect(null)).toBe('/dashboard');
  });
});

describe('signed transaction cookie', () => {
  it('round-trips and rejects tampering', () => {
    const transaction = {
      state: 'state-123',
      verifier: 'verifier-123',
      provider: 'forgejo' as const,
      redirect: '/dashboard',
      exp: Date.now() + 60_000,
    };
    const encoded = encodeTransaction(transaction);
    expect(decodeTransaction(encoded)).toEqual(transaction);

    const tampered = `${encoded.slice(0, -1)}x`;
    expect(() => decodeTransaction(tampered)).toThrow(AppError);
  });

  it('rejects an expired transaction', () => {
    const encoded = encodeTransaction({
      state: 's',
      verifier: 'v',
      provider: 'github',
      redirect: '/',
      exp: Date.now() - 1,
    });
    expect(() => decodeTransaction(encoded)).toThrow(/expired/);
  });
});

describe('provider configuration', () => {
  it('is absent until client credentials are set', () => {
    delete process.env.FORGEJO_CLIENT_ID;
    delete process.env.FORGEJO_CLIENT_SECRET;
    expect(providerConfig('forgejo')).toBeNull();
  });

  it('builds Forgejo endpoints from FORGEJO_URL', () => {
    process.env.FORGEJO_CLIENT_ID = 'client';
    process.env.FORGEJO_CLIENT_SECRET = 'secret';
    process.env.FORGEJO_URL = 'http://forgejo.test:3001/';
    const config = providerConfig('forgejo');
    expect(config).toMatchObject({
      authorizeUrl: 'http://forgejo.test:3001/login/oauth/authorize',
      tokenUrl: 'http://forgejo.test:3001/login/oauth/access_token',
      userUrl: 'http://forgejo.test:3001/api/v1/user',
    });
    delete process.env.FORGEJO_URL;
  });
});

describe('token exchange and profile fetch', () => {
  it('exchanges the code with PKCE and reads the profile', async () => {
    const config: OAuthProviderConfig = {
      id: 'forgejo',
      label: 'Forgejo',
      clientId: 'client',
      clientSecret: 'secret',
      authorizeUrl: `${base}/authorize`,
      tokenUrl: `${base}/token`,
      userUrl: `${base}/user`,
      scopes: 'openid profile email repo',
    };
    const token = await exchangeCode(config, 'code-1', 'http://gallery.test/auth/callback/forgejo', 'verifier-1');
    expect(token).toBe('token-123');
    expect(tokenRequest?.get('code')).toBe('code-1');
    expect(tokenRequest?.get('code_verifier')).toBe('verifier-1');
    expect(tokenRequest?.get('grant_type')).toBe('authorization_code');

    const profile = await fetchProfile(config, token);
    expect(profile).toMatchObject({
      subject: '7',
      username: 'jane',
      displayName: 'Jane Doe',
      email: 'jane@example.test',
    });
  });
});
