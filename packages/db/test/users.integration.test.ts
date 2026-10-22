import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashSessionToken } from '@gallery/core';
import { createDatabase, type Database } from '../src/client.js';
import { createSession, deleteSession, ensureDevUser, findSessionUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe('users and sessions (integration)', () => {
  let db: Database;
  const username = `dev-${Date.now().toString(36)}`;

  beforeAll(() => {
    db = createDatabase(url!, { max: 2 });
  });

  afterAll(async () => {
    await db`delete from users where username = ${username}`;
    await db.end({ timeout: 5 });
  });

  it('creates a dev user once and returns the same row', async () => {
    const first = await ensureDevUser(db, username);
    const second = await ensureDevUser(db, username);
    expect(second.id).toBe(first.id);
    expect(first.username).toBe(username);
    expect(first.role).toBe('user');
  });

  it('finds a user by session hash and rejects expired or deleted sessions', async () => {
    const user = await ensureDevUser(db, username);
    const token = 'test-token';
    const hash = hashSessionToken(token);
    const future = new Date(Date.now() + 60_000);
    await createSession(db, user.id, { tokenHash: hash, expiresAt: future, ip: null, userAgent: 'vitest' });

    expect(await findSessionUser(db, hash)).toEqual(user);

    await deleteSession(db, hash);
    expect(await findSessionUser(db, hash)).toBeNull();

    const expired = hashSessionToken('expired-token');
    await createSession(db, user.id, {
      tokenHash: expired,
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(await findSessionUser(db, expired)).toBeNull();
  });
});
