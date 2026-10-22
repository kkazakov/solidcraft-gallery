import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import {
  countProjectsForOwner,
  createLocalProject,
  findProjectByOwnerSlug,
  insertVersion,
  latestReadyVersion,
  listArtifacts,
  listProjectsForOwner,
  markVersionReady,
  markVersionRendering,
  updateProjectTitle,
  upsertArtifact,
} from '../src/projects.js';
import { ensureDevUser } from '../src/users.js';

const url = process.env.DATABASE_URL;
const maybe = url ? describe : describe.skip;
const stamp = Date.now().toString(36);

maybe('projects and versions (integration)', () => {
  let db: Database;
  let ownerId: string;
  let projectId: string;
  const username = `owner-${stamp}`;
  const slug = `case-${stamp}`;

  beforeAll(async () => {
    db = createDatabase(url!, { max: 2 });
    const user = await ensureDevUser(db, username);
    ownerId = user.id;
    projectId = await createLocalProject(db, {
      ownerId,
      ownerUsername: username,
      slug,
      title: 'Test case',
      tags: ['enclosure', 'test'],
      repoUrl: 'file:///tmp/gallery-does-not-exist',
      localPath: '/tmp/gallery-does-not-exist',
    });
  });

  afterAll(async () => {
    await db`delete from users where id = ${ownerId}`;
    await db.end({ timeout: 5 });
  });

  it('creates and finds a private local project', async () => {
    const project = await findProjectByOwnerSlug(db, username, slug);
    expect(project).not.toBeNull();
    expect(project!.id).toBe(projectId);
    expect(project!.visibility).toBe('private');
    expect(project!.status).toBe('pending');
    expect(project!.tags).toEqual(['enclosure', 'test']);
    expect(project!.repoProvider).toBe('local');
    expect(project!.localPath).toBe('/tmp/gallery-does-not-exist');
  });

  it('lists and counts projects for the owner', async () => {
    const projects = await listProjectsForOwner(db, ownerId);
    expect(projects.some((p) => p.id === projectId)).toBe(true);
    expect(await countProjectsForOwner(db, ownerId)).toBeGreaterThanOrEqual(1);
  });

  it('renames a project title without touching its slug', async () => {
    await updateProjectTitle(db, projectId, 'Renamed case');
    const renamed = await findProjectByOwnerSlug(db, username, slug);
    expect(renamed?.title).toBe('Renamed case');
    expect(renamed?.slug).toBe(slug);
  });

  it('stores a version, artifacts and marks it ready', async () => {
    const sha = new Uint8Array(createHash('sha256').update('design').digest());
    const versionId = await insertVersion(db, {
      projectId,
      commitSha: 'a'.repeat(40),
      tag: 'v1.0.0',
      message: 'Publish v1',
      authorName: 'Tester',
      authoredAt: new Date(),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: sha,
      designBytes: 1234,
      lean: true,
    });

    // Claiming a version twice is idempotent.
    const again = await insertVersion(db, {
      projectId,
      commitSha: 'a'.repeat(40),
      message: 'Publish v1',
      authorName: 'Tester',
      authoredAt: new Date(),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: sha,
      designBytes: 1234,
      lean: true,
    });
    expect(again).toBe(versionId);

    await markVersionRendering(db, versionId);
    await upsertArtifact(db, {
      versionId,
      kind: 'iso',
      storageKey: 'sha256/aa/iso.png',
      sha256: sha,
      bytes: 100,
      width: 1200,
      height: 900,
    });
    await markVersionReady(db, versionId, { bodies: 1, volume_mm3: 24000 }, []);

    const latest = await latestReadyVersion(db, projectId);
    expect(latest?.id).toBe(versionId);
    expect(latest?.metrics.bodies).toBe(1);
    expect(latest?.tag).toBe('v1.0.0');

    const artifacts = await listArtifacts(db, versionId);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]!.kind).toBe('iso');
  });
});
