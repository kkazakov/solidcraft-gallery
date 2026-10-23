import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import { createInvite, deleteInvite, findInviteById, listInvitesPage } from '../src/invites.js';
import { ensureDevUser, listUsersForAdmin, setUserAdmin, upsertOAuthUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);
const prefix = `adm-${stamp}`;

maybe('admin dashboard queries (integration)', () => {
  let db: Database;
  let firstId: string;

  beforeAll(async () => {
    db = createDatabase(url!, { max: 2 });
    const first = await ensureDevUser(db, `${prefix}-a`);
    firstId = first.id;
    await setUserAdmin(db, first.id);
    await ensureDevUser(db, `${prefix}-b`);
    await ensureDevUser(db, `${prefix}-c`);
    await upsertOAuthUser(db, {
      provider: 'forgejo',
      subject: `admin-subject-${stamp}`,
      username: `${prefix}-oauth`,
      displayName: 'OAuth Admin',
    });

    const repo = await db<{ id: string }[]>`
      insert into repos (owner_id, provider, external_id, url)
      values (${first.id}, 'local', ${`admin-repo-${stamp}`}, ${`file:///tmp/admin-${stamp}`})
      returning id
    `;
    await db`
      insert into projects (repo_id, owner_id, slug, title, design_path)
      values (${repo[0]!.id}, ${first.id}, ${`admin-project-${stamp}`}, 'Admin project', 'design.solidcraft')
    `;
  });

  afterAll(async () => {
    await db`delete from users where username like ${`${prefix}%`}`;
    await db.end({ timeout: 5 });
  });

  it('lists users newest first with roles, identities and project counts', async () => {
    const page = await listUsersForAdmin(db, { limit: 100, offset: 0 });
    expect(page.total).toBeGreaterThanOrEqual(4);

    const first = page.items.find((user) => user.id === firstId);
    expect(first).toMatchObject({
      username: `${prefix}-a`,
      role: 'admin',
      providers: [],
      projectCount: 1,
      suspendedAt: null,
    });
    expect(first?.createdAt).toBeInstanceOf(Date);

    const oauth = page.items.find((user) => user.username === `${prefix}-oauth`);
    expect(oauth).toMatchObject({ displayName: 'OAuth Admin', providers: ['forgejo'], projectCount: 0 });
  });

  it('paginates users without returning the same row twice', async () => {
    const first = await listUsersForAdmin(db, { limit: 1, offset: 0 });
    const second = await listUsersForAdmin(db, { limit: 1, offset: 1 });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    expect(second.total).toBe(first.total);
  });

  it('paginates invite codes and deletes only the requested row', async () => {
    const one = await createInvite(db, { createdBy: firstId, note: `${prefix}-one`, maxUses: 3 });
    const two = await createInvite(db, { createdBy: firstId, note: `${prefix}-two` });

    const page = await listInvitesPage(db, { limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBeGreaterThanOrEqual(2);

    expect(await findInviteById(db, one.id)).toMatchObject({
      id: one.id,
      note: `${prefix}-one`,
      maxUses: 3,
      uses: 0,
    });
    expect(await findInviteById(db, two.id)).not.toBeNull();
    expect(await findInviteById(db, '00000000-0000-4000-8000-000000000000')).toBeNull();

    const deleted = await deleteInvite(db, one.id);
    expect(deleted).toEqual({ id: one.id, note: `${prefix}-one`, maxUses: 3, uses: 0 });
    expect(await deleteInvite(db, one.id)).toBeNull();

    const after = await listInvitesPage(db, { limit: 200, offset: 0 });
    expect(after.total).toBe(page.total - 1);
    expect(after.items.some((invite) => invite.id === one.id)).toBe(false);
    expect(after.items.some((invite) => invite.id === two.id)).toBe(true);
  });
});
