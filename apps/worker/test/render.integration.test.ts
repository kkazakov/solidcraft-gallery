import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createDatabase,
  createExternalProject,
  createLocalProject,
  findProjectById,
  findVersionById,
  insertVersion,
  listArtifacts,
  type Database,
} from '@gallery/db';
import { LocalGitBackend, type LocalRepo } from '@gallery/git';
import { LocalStorage, artifactKey, sha256Hex } from '@gallery/storage';
import { loadConfig, type WorkerConfig } from '../src/config.js';
import { createLogger } from '../src/logger.js';
import { renderVersion } from '../src/render.js';

const databaseUrl = process.env.DATABASE_URL;
const cli = process.env.SOLIDCRAFT_CLI;
const maybe = databaseUrl && cli ? describe : describe.skip;
const stamp = Date.now().toString(36);
const fixture = fileURLToPath(new URL('../../../fixtures/real/box.solidcraft', import.meta.url));

maybe('renderVersion (real CLI integration)', () => {
  let db: Database;
  let root: string;
  let storage: LocalStorage;
  let config: WorkerConfig;
  let userId: string;
  let projectId: string;
  let versionId: string;
  let designSha: Uint8Array;
  let repo: LocalRepo;
  const username = `render-${stamp}`;
  const slug = `box-${stamp}`;

  beforeAll(async () => {
    db = createDatabase(databaseUrl!, { max: 2 });
    root = await mkdtemp(join(tmpdir(), 'gallery-render-it-'));

    const userRows = await db<{ id: string }[]>`
      insert into users (username) values (${username}) returning id
    `;
    userId = userRows[0]!.id;

    const backend = new LocalGitBackend(join(root, 'repos'));
    repo = await backend.createRepo({ owner: username, slug, title: 'Box' });
    const designBytes = new Uint8Array(await readFile(fixture));
    const commit = await backend.commitFiles({
      repo,
      files: {
        'project.json': JSON.stringify({
          schema: 1,
          title: 'Box',
          license: 'CC0-1.0',
          design: `designs/${slug}.solidcraft`,
        }),
        [`designs/${slug}.solidcraft`]: designBytes,
      },
      message: 'Seed box',
    });

    designSha = new Uint8Array(createHash('sha256').update(designBytes).digest());
    projectId = await createLocalProject(db, {
      ownerId: userId,
      ownerUsername: username,
      slug,
      title: 'Box',
      license: 'CC0-1.0',
      repoUrl: repo.url,
      localPath: repo.path,
    });
    versionId = await insertVersion(db, {
      projectId,
      commitSha: commit.commit,
      message: 'Seed box',
      authorName: 'Tester',
      authoredAt: new Date(),
      designPath: `designs/${slug}.solidcraft`,
      designSha256: designSha,
      designBytes: designBytes.byteLength,
      lean: true,
    });

    storage = new LocalStorage(join(root, 'artifacts'));
    config = loadConfig({
      DATABASE_URL: databaseUrl!,
      DATA_DIR: join(root, 'data'),
      SOLIDCRAFT_CLI: cli!,
      SANDBOX_MODE: 'direct',
      ALLOW_UNSANDBOXED_RENDER: '1',
      RENDER_TIMEOUT_SECONDS: '60',
    });
  }, 120_000);

  afterAll(async () => {
    if (userId) await db`delete from users where id = ${userId}`;
    await db.end({ timeout: 5 });
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('renders a version cached from an external source', async () => {
    const designBytes = new Uint8Array(await readFile(fixture));
    const sha = sha256Hex(designBytes);
    const designKey = artifactKey(sha, 'design.solidcraft');
    await storage.put(designKey, designBytes);

    const project = await createExternalProject(db, {
      ownerId: userId,
      ownerUsername: username,
      provider: 'github',
      externalId: `test-${stamp}`,
      url: `https://github.com/example/box-${stamp}`,
      defaultBranch: 'main',
      commitSha: 'f'.repeat(40),
      slug: `external-${stamp}`,
      title: 'External box',
      designPath: 'designs/case.solidcraft',
    });
    const externalVersion = await insertVersion(db, {
      projectId: project.projectId,
      commitSha: 'f'.repeat(40),
      message: 'External seed',
      authorName: 'Tester',
      authoredAt: new Date(),
      designPath: 'designs/case.solidcraft',
      designKey,
      designSha256: new Uint8Array(Buffer.from(sha, 'hex')),
      designBytes: designBytes.byteLength,
      lean: true,
    });

    const result = await renderVersion(externalVersion, {
      db,
      storage,
      config,
      log: createLogger({ test: true }),
    });
    expect(result.ok).toBe(true);
    const rendered = await findVersionById(db, externalVersion);
    expect(rendered?.status).toBe('ready');
    expect(rendered?.designKey).toBe(designKey);
  }, 120_000);

  it('renders previews, metrics and derivatives, then marks the project ready', async () => {
    const result = await renderVersion(versionId, {
      db,
      storage,
      config,
      log: createLogger({ test: true }),
    });
    expect(result.ok).toBe(true);
    expect(result.artifacts).toBeGreaterThanOrEqual(3);

    const version = await findVersionById(db, versionId);
    expect(version?.status).toBe('ready');
    expect(version?.metrics.bodies).toBe(1);

    const project = await findProjectById(db, projectId);
    expect(project?.status).toBe('ready');

    const artifacts = await listArtifacts(db, versionId);
    const iso = artifacts.find((artifact) => artifact.kind === 'iso');
    expect(iso).toBeDefined();
    const bytes = await storage.get(iso!.storageKey);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
  }, 120_000);
});
