import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import { ensureDevUser, upsertOAuthUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);

maybe('OAuth identities (integration)', () => {
  let db: Database;
  const userIds: string[] = [];

  beforeAll(() => {
    db = createDatabase(url!, { max: 2 });
  });

  afterAll(async () => {
    for (const id of userIds) await db`delete from users where id = ${id}`;
    await db.end({ timeout: 5 });
  });

  it('creates a user from an identity and is idempotent', async () => {
    const first = await upsertOAuthUser(db, {
      provider: 'forgejo',
      subject: `subject-${stamp}`,
      username: `Pi Maker ${stamp}`,
      displayName: 'Pi Maker',
      email: `pi-${stamp}@example.test`,
    });
    userIds.push(first.id);
    expect(first.username).toMatch(new RegExp(`^pi-maker-${stamp}`));

    const again = await upsertOAuthUser(db, {
      provider: 'forgejo',
      subject: `subject-${stamp}`,
      username: `Pi Maker ${stamp}`,
      displayName: 'Renamed Maker',
    });
    expect(again.id).toBe(first.id);

    const identity = await db<{ count: number }[]>`
      select count(*)::int as count from identities where subject = ${`subject-${stamp}`}
    `;
    expect(identity[0]!.count).toBe(1);
  });

  it('suffixes a collision instead of taking over the account', async () => {
    const existing = await ensureDevUser(db, `taken-${stamp}`);
    userIds.push(existing.id);
    const created = await upsertOAuthUser(db, {
      provider: 'github',
      subject: `collision-${stamp}`,
      username: `taken-${stamp}`,
    });
    userIds.push(created.id);
    expect(created.id).not.toBe(existing.id);
    expect(created.username).toMatch(/-2$/);
  });

  it('avoids reserved usernames', async () => {
    const created = await upsertOAuthUser(db, {
      provider: 'github',
      subject: `reserved-${stamp}`,
      username: 'admin',
    });
    userIds.push(created.id);
    expect(created.username.startsWith('admin-')).toBe(true);
  });
});
