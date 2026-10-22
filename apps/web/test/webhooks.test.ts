import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseGitHubPush, verifyGitHubSignature } from '../src/lib/server/webhooks.js';

const secret = 'webhook-secret';
const body = JSON.stringify({ repository: { id: 7 }, after: 'a'.repeat(40), ref: 'refs/heads/main' });
const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('GitHub webhook verification', () => {
  it('accepts the exact signed body', () => {
    expect(verifyGitHubSignature(secret, body, signature)).toBe(true);
  });

  it('rejects a modified body, wrong secret and malformed header', () => {
    expect(verifyGitHubSignature(secret, `${body} `, signature)).toBe(false);
    expect(verifyGitHubSignature('other', body, signature)).toBe(false);
    expect(verifyGitHubSignature(secret, body, 'sha1=abc')).toBe(false);
    expect(verifyGitHubSignature(secret, body, null)).toBe(false);
  });

  it('parses a push payload and rejects junk', () => {
    expect(parseGitHubPush(JSON.parse(body))).toMatchObject({
      repositoryId: '7',
      ref: 'refs/heads/main',
      deleted: false,
    });
    expect(parseGitHubPush({ repository: {}, after: 'x', ref: 'main' })).toBeNull();
    expect(parseGitHubPush(null)).toBeNull();
  });
});
