import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import { createInvite, findUsableInvite, hashInviteCode, provisionInvitedUser, revokeInvite } from '../src/invites.js';
import { ensureDevUser, findOAuthIdentity } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);

maybe('invited account provisioning (integration)', () => {
  let db: Database;
  let adminId: string;

  beforeAll(async () => {
    db = createDatabase(url!, { max: 2 });
    adminId = (await ensureDevUser(db, `provisioner-${stamp}`)).id;
  });

  afterAll(async () => {
    await db`delete from users where username like ${`invited-${stamp}%`}`;
    await db`delete from users where id = ${adminId}`;
    await db.end({ timeout: 5 });
  });

  it('checks usability without consuming the code', async () => {
    const invite = await createInvite(db, { createdBy: adminId, maxUses: 1 });
    const hash = hashInviteCode(invite.code);
    expect(await findUsableInvite(db, hash)).toBe(true);
    expect(await findUsableInvite(db, hash)).toBe(true);
  });

  it('creates the gallery user and identity in the invite transaction', async () => {
    const invite = await createInvite(db, { createdBy: adminId, maxUses: 1 });
    const hash = hashInviteCode(invite.code);
    const username = `invited-${stamp}-a`;
    const subject = `subject-${stamp}-a`;

    const user = await provisionInvitedUser(db, {
      codeHash: hash,
      provider: 'forgejo',
      subject,
      username,
      email: `${username}@example.test`,
    });

    expect(user?.username).toBe(username);
    expect(await findUsableInvite(db, hash)).toBe(false);
    expect((await findOAuthIdentity(db, 'forgejo', subject))?.username).toBe(username);

    expect(
      await provisionInvitedUser(db, {
        codeHash: hash,
        provider: 'forgejo',
        subject: `subject-${stamp}-b`,
        username: `invited-${stamp}-b`,
      }),
    ).toBeNull();
  });

  it('refuses revoked and expired invites', async () => {
    const revoked = await createInvite(db, { createdBy: adminId });
    await revokeInvite(db, revoked.id);
    expect(await findUsableInvite(db, hashInviteCode(revoked.code))).toBe(false);
    expect(
      await provisionInvitedUser(db, {
        codeHash: hashInviteCode(revoked.code),
        provider: 'forgejo',
        subject: `subject-${stamp}-c`,
        username: `invited-${stamp}-c`,
      }),
    ).toBeNull();

    const expired = await createInvite(db, {
      createdBy: adminId,
      maxUses: 2,
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await findUsableInvite(db, hashInviteCode(expired.code))).toBe(false);
  });
});
