import type { Database } from './client.js';

export type Role = 'user' | 'admin';

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
}

export interface SessionInput {
  tokenHash: Uint8Array;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Development-only account: no identity provider, no password. Gated by the
 * web layer (`DEV_LOGIN=1`, never in production) and useful for local flows
 * and end-to-end tests until the Forgejo OAuth callback lands.
 */
export async function ensureDevUser(db: Database, username: string): Promise<SessionUser> {
  const rows = await db<SessionUser[]>`
    insert into users (username, display_name)
    values (${username}, ${username})
    on conflict (username) do update set last_seen_at = now()
    returning id, username, role
  `;
  return rows[0]!;
}

export async function createSession(db: Database, userId: string, input: SessionInput): Promise<void> {
  await db`
    insert into sessions (user_id, token_hash, expires_at, ip, user_agent)
    values (
      ${userId},
      ${input.tokenHash},
      ${input.expiresAt},
      ${input.ip ?? null},
      ${input.userAgent?.slice(0, 300) ?? null}
    )
  `;
}

export async function findSessionUser(db: Database, tokenHash: Uint8Array): Promise<SessionUser | null> {
  const rows = await db<SessionUser[]>`
    select u.id, u.username, u.role
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash}
      and s.expires_at > now()
      and u.suspended_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

export async function deleteSession(db: Database, tokenHash: Uint8Array): Promise<void> {
  await db`delete from sessions where token_hash = ${tokenHash}`;
}

export async function findUserById(db: Database, id: string): Promise<SessionUser | null> {
  const rows = await db<SessionUser[]>`
    select id, username, role from users where id = ${id} limit 1
  `;
  return rows[0] ?? null;
}
