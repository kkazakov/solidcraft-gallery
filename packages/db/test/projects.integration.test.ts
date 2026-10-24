import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../src/client.js';
import {
  countProjectsForOwner,
  createLocalProject,
  findProjectByOwnerSlug,
  findVersionById,
  insertVersion,
  latestFailedVersion,
  latestReadyVersion,
  listArtifacts,
  listProjectsForOwner,
  markVersionFailed,
  markVersionReady,
  markVersionRendering,
  setActiveVersion,
  updateProjectDetails,
  upsertArtifact,
} from '../src/projects.js';
import { requeueVersion } from '../src/jobs.js';
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

  it('renames a project without touching its slug', async () => {
    await updateProjectDetails(db, projectId, 'Renamed case', 'A case for a small board.');
    const renamed = await findProjectByOwnerSlug(db, username, slug);
    expect(renamed?.title).toBe('Renamed case');
    expect(renamed?.description).toBe('A case for a small board.');
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

  it('uses the active ready version instead of the newest one', async () => {
    const first = await latestReadyVersion(db, projectId);
    expect(first).not.toBeNull();

    const sha = new Uint8Array(createHash('sha256').update('design v2').digest());
    const second = await insertVersion(db, {
      projectId,
      commitSha: 'b'.repeat(40),
      tag: 'v2.0.0',
      message: 'Publish v2',
      authorName: 'Tester',
      authoredAt: new Date(Date.now() + 60_000),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: sha,
      designBytes: 4321,
      lean: true,
    });
    await markVersionReady(db, second, { bodies: 1, volume_mm3: 25000 }, []);

    // Newest wins until someone pins an older ready version.
    expect((await latestReadyVersion(db, projectId))?.id).toBe(second);
    expect(await setActiveVersion(db, projectId, first!.id)).toBe(true);
    expect((await latestReadyVersion(db, projectId))?.id).toBe(first!.id);
    expect((await findProjectByOwnerSlug(db, username, slug))?.activeVersionId).toBe(first!.id);

    // A version that has not rendered cannot become active.
    const pending = await insertVersion(db, {
      projectId,
      commitSha: 'c'.repeat(40),
      tag: 'v3.0.0',
      message: 'Publish v3',
      authorName: 'Tester',
      authoredAt: new Date(Date.now() + 120_000),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: sha,
      designBytes: 1234,
      lean: true,
    });
    expect(await setActiveVersion(db, projectId, pending)).toBe(false);
    expect(await setActiveVersion(db, projectId, second)).toBe(true);
    expect((await latestReadyVersion(db, projectId))?.id).toBe(second);
  });

  it('requeues a failed version exactly once', async () => {
    const sha = new Uint8Array(createHash('sha256').update('design v4').digest());
    const versionId = await insertVersion(db, {
      projectId,
      commitSha: 'd'.repeat(40),
      message: 'Publish v4',
      authorName: 'Tester',
      authoredAt: new Date(Date.now() + 180_000),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: sha,
      designBytes: 1234,
      lean: true,
    });
    await markVersionFailed(db, versionId, 'renderer_outdated', 'format 34');
    expect((await latestFailedVersion(db, projectId))?.id).toBe(versionId);

    expect(await requeueVersion(db, versionId)).toBe(true);
    const version = await findVersionById(db, versionId);
    expect(version?.status).toBe('pending');
    expect(version?.errorCode).toBeNull();
    expect(version?.errorDetail).toBeNull();

    const jobs = await db<{ kind: string; payload: { versionId: string } }[]>`
      select kind, payload from jobs where payload->>'versionId' = ${versionId}
    `;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.kind).toBe('version.render');
    expect(jobs[0]!.payload.versionId).toBe(versionId);

    // The second click finds the version already pending and adds no job.
    expect(await requeueVersion(db, versionId)).toBe(false);
    await db`delete from jobs where payload->>'versionId' = ${versionId}`;
  });
});
