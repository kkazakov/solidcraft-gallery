import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import {
  countPublicProjects,
  listFeaturedProjects,
  listLicenses,
  listPopularTags,
  searchPublicProjects,
} from '../src/search.js';
import {
  createLocalProject,
  insertVersion,
  markVersionReady,
  setProjectReady,
  setProjectVisibility,
  upsertArtifact,
} from '../src/projects.js';
import { ensureDevUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);
const username = `search-${stamp}`;

maybe('public search (integration)', () => {
  let db: Database;
  let ownerId: string;
  let first: string;
  let second: string;
  let hidden: string;

  beforeAll(async () => {
    db = createDatabase(url!, { max: 2 });
    const user = await ensureDevUser(db, username);
    ownerId = user.id;

    first = await createLocalProject(db, {
      ownerId,
      ownerUsername: username,
      slug: `pi-case-${stamp}`,
      title: 'Raspberry Pi 4 case',
      tags: ['enclosure', 'raspberry-pi'],
      repoUrl: 'file:///tmp/nowhere-pi-case',
      localPath: '/tmp/nowhere-pi-case',
    });
    second = await createLocalProject(db, {
      ownerId,
      ownerUsername: username,
      slug: `standoff-${stamp}`,
      title: 'M3 standoff',
      tags: ['fastener'],
      repoUrl: 'file:///tmp/nowhere-standoff',
      localPath: '/tmp/nowhere-standoff',
    });
    hidden = await createLocalProject(db, {
      ownerId,
      ownerUsername: username,
      slug: `secret-${stamp}`,
      title: 'Secret bracket',
      tags: ['enclosure'],
      repoUrl: 'file:///tmp/nowhere-secret',
      localPath: '/tmp/nowhere-secret',
    });

    await db`update projects set description = ${'Snap-fit enclosure for a Raspberry Pi'}, keywords = ${'raspberry pi enclosure petg'} where id = ${first}`;
    await db`update projects set description = ${'A small M3 standoff'}, keywords = ${'m3 standoff petg'} where id = ${second}`;

    await setProjectReady(db, first);
    await setProjectReady(db, second);
    await setProjectReady(db, hidden);
    await setProjectVisibility(db, first, 'public', 'CC-BY-4.0');
    await setProjectVisibility(db, second, 'public', 'MIT');
    await setProjectVisibility(db, hidden, 'private', 'MIT');
    await db`update projects set featured = true, published_at = now() - interval '2 days' where id = ${first}`;
    await db`update projects set published_at = now() - interval '1 day' where id = ${second}`;

    const versionId = await insertVersion(db, {
      projectId: first,
      commitSha: 'b'.repeat(40),
      tag: 'v1.0.0',
      message: 'Seed',
      authorName: 'Tester',
      authoredAt: new Date(),
      designPath: `designs/pi-case-${stamp}.solidcraft`,
      designSha256: new Uint8Array(createHash('sha256').update('x').digest()),
      designBytes: 10,
      lean: true,
    });
    await markVersionReady(db, versionId, { bodies: 1 }, []);
    await upsertArtifact(db, {
      versionId,
      kind: 'iso',
      storageKey: 'sha256/aa/bb/iso.png',
      sha256: new Uint8Array(createHash('sha256').update('x').digest()),
      bytes: 100,
      width: 1200,
      height: 900,
    });
  });

  afterAll(async () => {
    await db`delete from users where id = ${ownerId}`;
    await db.end({ timeout: 5 });
  });

  it('finds a title word and returns the cover artifact', async () => {
    const result = await searchPublicProjects(db, { q: 'raspberry' });
    expect(result.items[0]?.id).toBe(first);
    expect(result.items[0]?.coverKey).toBe('sha256/aa/bb/iso.png');
    expect(result.total).toBe(1);
  });

  it('matches prose with the english configuration', async () => {
    const result = await searchPublicProjects(db, { q: 'enclosure' });
    expect(result.items.map((item) => item.id)).toContain(first);
    expect(result.items.map((item) => item.id)).not.toContain(hidden);
  });

  it('filters by tag and license and excludes private projects', async () => {
    const tagged = await searchPublicProjects(db, { tag: 'fastener' });
    expect(tagged.items.map((item) => item.id)).toEqual([second]);

    const licensed = await searchPublicProjects(db, { license: 'MIT' });
    expect(licensed.items.map((item) => item.id)).toEqual([second]);

    const all = await searchPublicProjects(db, {});
    expect(all.items.map((item) => item.id)).not.toContain(hidden);
    expect(all.total).toBe(2);
    expect(all.items[0]?.id).toBe(second); // newest first
  });

  it('lists tags, licenses, featured projects and counts', async () => {
    expect((await listPopularTags(db)).some((entry) => entry.tag === 'enclosure')).toBe(true);
    expect((await listLicenses(db)).map((entry) => entry.license)).toEqual(
      expect.arrayContaining(['MIT', 'CC-BY-4.0']),
    );
    expect((await listFeaturedProjects(db)).map((item) => item.id)).toEqual([first]);
    expect(await countPublicProjects(db)).toBe(2);
  });

  it('falls back to trigram search for a typo', async () => {
    const result = await searchPublicProjects(db, { q: 'rasbery' });
    expect(result.fallback).toBe(true);
    expect(result.items.map((item) => item.id)).toContain(first);
  });
});
