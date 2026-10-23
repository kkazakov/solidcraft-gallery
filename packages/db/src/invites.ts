import { createHash, randomBytes } from 'node:crypto';
import type { Database } from './client.js';
import type { SessionUser } from './users.js';

export interface Invite {
  id: string;
  note: string;
  maxUses: number;
  uses: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  createdBy: string;
}

export function generateInviteCode(): string {
  return randomBytes(16).toString('base64url');
}

/** Codes are high-entropy; a plain SHA-256 is enough for lookup and storage. */
export function hashInviteCode(code: string): Uint8Array {
  return createHash('sha256').update(code.trim()).digest();
}

export async function createInvite(
  db: Database,
  input: { createdBy: string; note?: string; maxUses?: number; expiresAt?: Date | null },
): Promise<{ id: string; code: string }> {
  const code = generateInviteCode();
  const rows = await db<{ id: string }[]>`
    insert into invites (code_hash, created_by, note, max_uses, expires_at)
    values (
      ${hashInviteCode(code)},
      ${input.createdBy},
      ${(input.note ?? '').slice(0, 200)},
      ${Math.min(Math.max(input.maxUses ?? 1, 1), 1000)},
      ${input.expiresAt ?? null}
    )
    returning id
  `;
  return { id: rows[0]!.id, code };
}

/** Atomically consume one use. A revoked, expired or exhausted invite returns false. */
export async function consumeInvite(db: Database, codeHash: Uint8Array): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    update invites
    set uses = uses + 1
    where code_hash = ${codeHash}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and uses < max_uses
    returning id
  `;
  return rows.length > 0;
}

export async function listInvites(db: Database): Promise<Invite[]> {
  return db<Invite[]>`
    select
      i.id, i.note, i.max_uses as "maxUses", i.uses,
      i.expires_at as "expiresAt", i.revoked_at as "revokedAt",
      i.created_at as "createdAt", u.username::text as "createdBy"
    from invites i
    join users u on u.id = i.created_by
    order by i.created_at desc
    limit 200
  `;
}

export async function revokeInvite(db: Database, id: string): Promise<boolean> {
  const rows = await db<{ id: string }[]>`
    update invites set revoked_at = now() where id = ${id} and revoked_at is null returning id
  `;
  return rows.length > 0;
}

/** Read-only validity check; the use is not consumed. */
export async function findUsableInvite(db: Database, codeHash: Uint8Array): Promise<boolean> {
  const rows = await db`
    select 1 from invites
    where code_hash = ${codeHash}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
      and uses < max_uses
    limit 1
  `;
  return rows.length > 0;
}

export interface InvitedAccountInput {
  codeHash: Uint8Array;
  provider: 'forgejo' | 'github';
  subject: string;
  username: string;
  email?: string | null;
  displayName?: string;
  avatarUrl?: string | null;
}

/**
 * Consume one invite use and create the gallery user plus its provider identity
 * in one transaction. Returns null when the code is unknown, revoked, expired or
 * already used up; the transaction rolls back so no partially used invite remains.
 */
export async function provisionInvitedUser(db: Database, input: InvitedAccountInput): Promise<SessionUser | null> {
  return db.begin(async (tx) => {
    const invites = await tx<{ id: string }[]>`
      update invites
      set uses = uses + 1
      where code_hash = ${input.codeHash}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
        and uses < max_uses
      returning id
    `;
    if (!invites[0]) return null;

    let email = input.email?.trim().toLowerCase() || null;
    if (email) {
      const used = await tx`select 1 from users where email = ${email} limit 1`;
      if (used[0]) email = null;
    }

    const users = await tx<SessionUser[]>`
      insert into users (username, email, display_name, avatar_url)
      values (
        ${input.username},
        ${email},
        ${(input.displayName ?? input.username).slice(0, 80)},
        ${input.avatarUrl?.slice(0, 500) ?? null}
      )
      returning id, username::text as username, role::text as role
    `;

    await tx`
      insert into identities (user_id, provider, subject, username, scopes)
      values (${users[0]!.id}, ${input.provider}, ${input.subject}, ${input.username}, '{}')
    `;

    return users[0]!;
  });
}
