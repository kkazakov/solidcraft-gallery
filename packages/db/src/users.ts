import { isValidSlug, slugify } from '@gallery/core';
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

export async function findUserByUsername(db: Database, username: string): Promise<SessionUser | null> {
  const rows = await db<SessionUser[]>`
    select id, username::text as username, role::text as role
    from users where username = ${username} limit 1
  `;
  return rows[0] ?? null;
}

export type OAuthProvider = 'forgejo' | 'github';

export interface OAuthProfile {
  provider: OAuthProvider;
  subject: string;
  username: string;
  displayName?: string;
  email?: string | null;
  avatarUrl?: string | null;
}

/**
 * Create or reuse the site account linked to a provider identity. The provider
 * username is a suggestion: collisions and reserved names get a suffix, never
 * an account takeover. Tokens are intentionally not persisted until token
 * encryption is wired.
 */
export async function upsertOAuthUser(db: Database, profile: OAuthProfile): Promise<SessionUser> {
  return db.begin(async (tx) => {
    const existing = await tx<SessionUser[]>`
      select u.id, u.username::text as username, u.role::text as role
      from identities i
      join users u on u.id = i.user_id
      where i.provider = ${profile.provider} and i.subject = ${profile.subject}
      limit 1
    `;

    if (existing[0]) {
      await tx`
        update identities set username = ${profile.username}, updated_at = now()
        where provider = ${profile.provider} and subject = ${profile.subject}
      `;
      await tx`
        update users
        set last_seen_at = now(),
            display_name = coalesce(nullif(${profile.displayName ?? ''}, ''), display_name)
        where id = ${existing[0].id}
      `;
      return existing[0];
    }

    let base = slugify(profile.username, { maxLength: 30, fallback: 'maker' });
    if (!isValidSlug(base, 3, 32)) base = slugify(`${base}-user`, { maxLength: 32, fallback: 'maker' });

    let candidate = base;
    for (let attempt = 2; attempt < 100; attempt += 1) {
      const taken = await tx`select 1 from users where username = ${candidate} limit 1`;
      if (!taken[0]) break;
      const suffix = `-${attempt}`;
      candidate = `${base.slice(0, 32 - suffix.length)}${suffix}`;
    }

    let email = profile.email?.trim().toLowerCase() || null;
    if (email) {
      const used = await tx`select 1 from users where email = ${email} limit 1`;
      if (used[0]) email = null;
    }

    const users = await tx<SessionUser[]>`
      insert into users (username, email, display_name, avatar_url)
      values (
        ${candidate},
        ${email},
        ${(profile.displayName ?? '').slice(0, 80)},
        ${profile.avatarUrl?.slice(0, 500) ?? null}
      )
      returning id, username::text as username, role::text as role
    `;

    await tx`
      insert into identities (user_id, provider, subject, username, scopes)
      values (${users[0]!.id}, ${profile.provider}, ${profile.subject}, ${profile.username}, '{}')
    `;

    return users[0]!;
  });
}

export async function findIdentityUsername(
  db: Database,
  userId: string,
  provider: OAuthProvider,
): Promise<string | null> {
  const rows = await db<{ username: string | null }[]>`
    select username from identities
    where user_id = ${userId} and provider = ${provider}
    limit 1
  `;
  return rows[0]?.username ?? null;
}
