import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import { consumeInvite, createInvite, hashInviteCode, listInvites, revokeInvite } from '../src/invites.js';
import { ensureDevUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);

maybe('invites (integration)', () => {
  let db: Database;
  let userId: string;

  beforeAll(async () => {
    db = createDatabase(url!, { max: 2 });
    const user = await ensureDevUser(db, `inviter-${stamp}`);
    userId = user.id;
  });

  afterAll(async () => {
    await db`delete from users where id = ${userId}`;
    await db.end({ timeout: 5 });
  });

  it('creates a single-use invite and consumes it exactly once', async () => {
    const invite = await createInvite(db, { createdBy: userId, note: 'beta' });
    expect(invite.code.length).toBeGreaterThan(16);
    expect(await consumeInvite(db, hashInviteCode(invite.code))).toBe(true);
    expect(await consumeInvite(db, hashInviteCode(invite.code))).toBe(false);

    const listed = await listInvites(db);
    const row = listed.find((entry) => entry.id === invite.id);
    expect(row).toMatchObject({ uses: 1, maxUses: 1, note: 'beta' });
  });

  it('rejects revoked, expired and unknown codes', async () => {
    const revoked = await createInvite(db, { createdBy: userId });
    expect(await revokeInvite(db, revoked.id)).toBe(true);
    expect(await consumeInvite(db, hashInviteCode(revoked.code))).toBe(false);
    expect(await revokeInvite(db, revoked.id)).toBe(false);

    const expired = await createInvite(db, {
      createdBy: userId,
      maxUses: 3,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await consumeInvite(db, hashInviteCode(expired.code))).toBe(false);

    expect(await consumeInvite(db, hashInviteCode('not-a-real-code'))).toBe(false);
  });
});
