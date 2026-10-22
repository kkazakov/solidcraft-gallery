import { AppError, LIMITS, can, isValidSlug, nextAvailableSlug, slugify } from '@gallery/core';
import { leanDesign } from '@gallery/design';
import { sha256Hex } from '@gallery/storage';
import {
  countProjectsForOwner,
  createLocalProject,
  enqueueJob,
  findProjectById,
  findProjectByOwnerSlug,
  getDatabase,
  insertVersion,
  listProjectSlugs,
  type Project,
  type SessionUser,
} from '@gallery/db';
import type { LocalRepo } from '@gallery/git';
import { git } from './config.js';

export function localRepo(project: Project): LocalRepo {
  if (project.repoProvider !== 'local' || !project.localPath) {
    throw new AppError('validation_failed', 'this project does not use the local git backend yet');
  }
  return {
    owner: project.ownerUsername,
    slug: project.slug,
    path: project.localPath,
    url: project.repoUrl,
  };
}

export function uniqueProjectSlug(desired: string, taken: string[]): string {
  let base = slugify(desired, { fallback: 'project' });
  if (!isValidSlug(base)) base = `${base}-project`.slice(0, 64);
  return nextAvailableSlug(base, taken);
}

export async function createHostedProject(input: {
  viewer: SessionUser;
  title: string;
  slug?: string;
}): Promise<{ id: string; slug: string; owner: string }> {
  const db = getDatabase();
  const title = input.title.trim();
  if (title.length < 1 || title.length > LIMITS.titleChars) {
    throw new AppError('validation_failed', `title must be 1-${LIMITS.titleChars} characters`);
  }

  const count = await countProjectsForOwner(db, input.viewer.id);
  if (count >= LIMITS.projectsPerUser) {
    throw new AppError('conflict', `the beta limit is ${LIMITS.projectsPerUser} projects per user`);
  }

  const held = await listProjectSlugs(db, input.viewer.id);
  const slug = uniqueProjectSlug(input.slug?.trim() || title, held);
  if (!isValidSlug(slug)) throw new AppError('validation_failed', 'invalid project slug');

  const repo = await git.createRepo({ owner: input.viewer.username, slug, title });
  const id = await createLocalProject(db, {
    ownerId: input.viewer.id,
    ownerUsername: input.viewer.username,
    slug,
    title,
    repoUrl: repo.url,
    localPath: repo.path,
  });

  return { id, slug, owner: input.viewer.username };
}

export function projectManifest(project: Project): string {
  return JSON.stringify(
    {
      schema: 1,
      title: project.title,
      ...(project.description ? { description: project.description } : {}),
      ...(project.license ? { license: project.license } : {}),
      design: project.designPath,
      ...(project.tags.length > 0 ? { tags: project.tags } : {}),
    },
    null,
    2,
  );
}

export function canPublish(project: Project, viewer: SessionUser): boolean {
  return can(project, viewer, 'publish');
}

export async function publishDesign(input: {
  viewer: SessionUser;
  projectId: string;
  bytes: Uint8Array;
  tag?: string;
  message?: string;
}): Promise<{ versionId: string; commit: string }> {
  const db = getDatabase();
  const project = await findProjectById(db, input.projectId);
  if (!project || !canPublish(project, input.viewer)) {
    throw new AppError('not_found', 'No such project');
  }

  if (input.bytes.byteLength > LIMITS.designBytes) {
    throw new AppError('payload_too_large', `design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`, {
      limit_bytes: LIMITS.designBytes,
    });
  }

  const tag = input.tag?.trim();
  if (tag && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(tag)) {
    throw new AppError('validation_failed', 'tag must be 1-64 letters, digits, dots, underscores or hyphens');
  }

  const lean = leanDesign(input.bytes);
  const repo = localRepo(project);
  const message =
    input.message?.trim() || `${project.title} ${tag ? `— ${tag}` : new Date().toISOString().slice(0, 10)}`;

  const commit = await git.commitFiles({
    repo,
    files: {
      'project.json': projectManifest(project),
      [project.designPath]: lean,
    },
    message,
  });

  if (tag) await git.tag({ repo, commit: commit.commit, tag });

  const versionId = await insertVersion(db, {
    projectId: project.id,
    commitSha: commit.commit,
    tag: tag ?? null,
    message,
    authorName: input.viewer.username,
    authoredAt: new Date(),
    designPath: project.designPath,
    designSha256: new Uint8Array(Buffer.from(sha256Hex(lean), 'hex')),
    designBytes: lean.byteLength,
    lean: true,
  });

  await enqueueJob(db, 'version.render', { versionId }, { priority: 10 });
  return { versionId, commit: commit.commit };
}

export async function getViewableProject(owner: string, slug: string, viewer: SessionUser | null): Promise<Project> {
  const project = await findProjectByOwnerSlug(getDatabase(), owner, slug);
  if (!project || !can(project, viewer, 'view')) throw new AppError('not_found', 'No such project');
  return project;
}
