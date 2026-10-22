import { AppError, LIMITS, can, isValidSlug, nextAvailableSlug, slugify } from '@gallery/core';
import {
  countProjectsForOwner,
  createExternalProject,
  createLocalProject,
  enqueueJob,
  findIdentityUsername,
  findProjectById,
  findProjectByOwnerSlug,
  findRepoById,
  getDatabase,
  insertVersion,
  listProjectSlugs,
  setProjectVisibilityAndRepo,
  updateProjectTitle,
  type Project,
  type ProjectVisibility,
  type SessionUser,
} from '@gallery/db';
import { leanDesign } from '@gallery/design';
import type { LocalRepo } from '@gallery/git';
import { artifactKey, sha256Hex } from '@gallery/storage';
import { git, storage } from './config.js';
import { forgejoContext, forgejoForProject } from './forgejo.js';

export function localRepo(project: Project): LocalRepo {
  if (project.repoProvider !== 'local' || !project.localPath) {
    throw new AppError('validation_failed', 'this project does not use the local git backend');
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
  const designPath = `designs/${slug}.solidcraft`;

  const forgejo = forgejoContext();
  if (forgejo) {
    const remote = await forgejo.client.createRepo({ name: slug, private: true });
    const providerUsername = await findIdentityUsername(db, input.viewer.id, 'forgejo');
    if (providerUsername) {
      try {
        await forgejo.client.addCollaborator(remote.owner, remote.name, providerUsername);
      } catch (error) {
        // The site remains usable even if the collaborator grant fails; the
        // admin token still owns the repository.
        console.warn('could not add Forgejo collaborator', { project: slug, error });
      }
    }

    const created = await createExternalProject(db, {
      ownerId: input.viewer.id,
      ownerUsername: input.viewer.username,
      provider: 'forgejo',
      externalId: remote.fullName,
      url: remote.url,
      defaultBranch: remote.defaultBranch,
      commitSha: null,
      isPrivate: true,
      slug,
      title,
      designPath,
    });
    return { id: created.projectId, slug, owner: input.viewer.username };
  }

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
  if (project.repoProvider === 'github') {
    throw new AppError('forbidden', 'GitHub projects are read-only; push to the repository and sync instead');
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
  const message =
    input.message?.trim() || `${project.title} ${tag ? `— ${tag}` : new Date().toISOString().slice(0, 10)}`;

  let commit: string;
  let designKey: string | null = null;

  if (project.repoProvider === 'forgejo') {
    const { client, owner, repo } = await forgejoForProject(project);
    const sha = sha256Hex(lean);
    designKey = artifactKey(sha, 'design.solidcraft');
    await storage.put(designKey, lean);

    await client.upsertFile({
      owner,
      repo,
      path: project.designPath,
      content: lean,
      message,
      branch: 'main',
    });
    const manifest = await client.upsertFile({
      owner,
      repo,
      path: 'project.json',
      content: new TextEncoder().encode(projectManifest(project)),
      message,
      branch: 'main',
    });
    commit = manifest.commit;
    if (tag) await client.tag({ owner, repo, name: tag, target: commit, message });
  } else {
    const repo = localRepo(project);
    const result = await git.commitFiles({
      repo,
      files: {
        'project.json': projectManifest(project),
        [project.designPath]: lean,
      },
      message,
    });
    commit = result.commit;
    if (tag) await git.tag({ repo, commit, tag });
  }

  const versionId = await insertVersion(db, {
    projectId: project.id,
    commitSha: commit,
    tag: tag ?? null,
    message,
    authorName: input.viewer.username,
    authoredAt: new Date(),
    designPath: project.designPath,
    ...(designKey ? { designKey } : {}),
    designSha256: new Uint8Array(Buffer.from(sha256Hex(lean), 'hex')),
    designBytes: lean.byteLength,
    lean: true,
  });

  await enqueueJob(db, 'version.render', { versionId }, { priority: 10 });
  return { versionId, commit };
}

/** Keep the Forgejo repository visibility in step before changing the DB row. */
export async function applyProjectVisibility(
  project: Project,
  visibility: ProjectVisibility,
  license: string | null,
): Promise<void> {
  const db = getDatabase();
  const previousPrivate = project.repoPrivate;
  let forgejo: Awaited<ReturnType<typeof forgejoForProject>> | null = null;

  try {
    if (project.repoProvider === 'forgejo') {
      forgejo = await forgejoForProject(project);
      await forgejo.client.setPrivate(forgejo.owner, forgejo.repo, visibility === 'private');
    }

    const repoRow = await findRepoById(db, project.repoId);
    await setProjectVisibilityAndRepo(db, {
      projectId: project.id,
      visibility,
      license,
      ...(repoRow ? { repoId: repoRow.id, repoPrivate: visibility === 'private' } : {}),
    });
    console.info('project visibility changed', {
      projectId: project.id,
      from: project.visibility,
      to: visibility,
    });
  } catch (error) {
    // The external repository is not part of the DB transaction; put it back if
    // the project row could not be updated so the two never disagree.
    if (forgejo) {
      try {
        await forgejo.client.setPrivate(forgejo.owner, forgejo.repo, previousPrivate);
      } catch {
        console.error('could not roll back Forgejo visibility', { projectId: project.id });
      }
    }
    console.error('project visibility change failed', { projectId: project.id, to: visibility, error });
    throw error;
  }
}

export async function getViewableProject(owner: string, slug: string, viewer: SessionUser | null): Promise<Project> {
  const project = await findProjectByOwnerSlug(getDatabase(), owner, slug);
  if (!project || !can(project, viewer, 'view')) throw new AppError('not_found', 'No such project');
  return project;
}

/** Rename the site title and keep the hosted project.json in step. */
export async function renameProject(input: { viewer: SessionUser; projectId: string; title: string }): Promise<void> {
  const db = getDatabase();
  const project = await findProjectById(db, input.projectId);
  if (!project || !can(project, input.viewer, 'edit')) throw new AppError('not_found', 'No such project');

  const title = input.title.trim();
  if (title.length < 1 || title.length > LIMITS.titleChars) {
    throw new AppError('validation_failed', `title must be 1-${LIMITS.titleChars} characters`);
  }
  if (title === project.title) return;

  const updated: Project = { ...project, title };
  const message = `Rename project to ${title}`;

  if (project.repoProvider === 'forgejo') {
    const { client, owner, repo } = await forgejoForProject(project);
    await client.upsertFile({
      owner,
      repo,
      path: 'project.json',
      content: new TextEncoder().encode(projectManifest(updated)),
      message,
      branch: 'main',
    });
  } else if (project.repoProvider === 'local') {
    const repo = localRepo(project);
    await git.commitFiles({
      repo,
      files: { 'project.json': projectManifest(updated) },
      message,
    });
  }

  await updateProjectTitle(db, project.id, title);
}
