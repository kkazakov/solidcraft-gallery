import { createHmac, timingSafeEqual } from 'node:crypto';

export interface GitHubPush {
  repositoryId: string;
  after: string;
  ref: string;
  deleted: boolean;
  forced: boolean;
}

/** GitHub signs the exact raw body with HMAC-SHA256. Compare in constant time. */
export function verifyGitHubSignature(secret: string, rawBody: string, header: string | null): boolean {
  if (!header || !header.startsWith('sha256=')) return false;
  const provided = Buffer.from(header.slice('sha256='.length), 'hex');
  if (provided.length !== 32) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(provided, expected);
}

export function parseGitHubPush(payload: unknown): GitHubPush | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const body = payload as {
    repository?: { id?: unknown };
    after?: unknown;
    ref?: unknown;
    deleted?: unknown;
    forced?: unknown;
  };
  const id = body.repository?.id;
  if ((typeof id !== 'number' && typeof id !== 'string') || typeof body.after !== 'string') return null;
  if (typeof body.ref !== 'string' || !body.ref.startsWith('refs/')) return null;
  return {
    repositoryId: String(id),
    after: body.after,
    ref: body.ref,
    deleted: body.deleted === true,
    forced: body.forced === true,
  };
}
