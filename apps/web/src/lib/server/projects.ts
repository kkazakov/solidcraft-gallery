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
  findVersionById,
  getDatabase,
  insertVersion,
  listProjectSlugs,
  setActiveVersion,
  setProjectVisibilityAndRepo,
  updateProjectDetails as updateProjectDetailsRow,
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
  description?: string;
  license?: string | null;
  slug?: string;
}): Promise<{ id: string; slug: string; owner: string }> {
  const db = getDatabase();
  const title = input.title.trim();
  if (title.length < 1 || title.length > LIMITS.titleChars) {
    throw new AppError('validation_failed', `title must be 1-${LIMITS.titleChars} characters`);
  }
  const description = input.description?.trim() ?? '';
  if (description.length > LIMITS.descriptionChars) {
    throw new AppError('validation_failed', `description must be at most ${LIMITS.descriptionChars} characters`);
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
      description,
      license: input.license ?? null,
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
    description,
    license: input.license ?? null,
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

/** Write project.json for hosted repositories; GitHub is read-only. */
async function syncProjectManifest(project: Project, message: string): Promise<void> {
  if (project.repoProvider === 'forgejo') {
    const { client, owner, repo } = await forgejoForProject(project);
    await client.upsertFile({
      owner,
      repo,
      path: 'project.json',
      content: new TextEncoder().encode(projectManifest(project)),
      message,
      branch: 'main',
    });
  } else if (project.repoProvider === 'local') {
    const repo = localRepo(project);
    await git.commitFiles({
      repo,
      files: { 'project.json': projectManifest(project) },
      message,
    });
  }
}

export async function updateProjectDetails(input: {
  viewer: SessionUser;
  projectId: string;
  title: string;
  description: string;
}): Promise<void> {
  const db = getDatabase();
  const project = await findProjectById(db, input.projectId);
  if (!project || !can(project, input.viewer, 'edit')) throw new AppError('not_found', 'No such project');

  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 1 || title.length > LIMITS.titleChars) {
    throw new AppError('validation_failed', `title must be 1-${LIMITS.titleChars} characters`);
  }
  if (description.length > LIMITS.descriptionChars) {
    throw new AppError('validation_failed', `description must be at most ${LIMITS.descriptionChars} characters`);
  }
  if (title === project.title && description === project.description) return;

  await syncProjectManifest(
    { ...project, title, description },
    title === project.title ? 'Update project description' : `Rename project to ${title}`,
  );
  await updateProjectDetailsRow(db, project.id, title, description);
}

/**
 * Change who can see the project. The caller has already validated the core
 * visibility rules; this keeps the repository, the row and project.json aligned.
 */
export async function updateProjectPublication(input: {
  viewer: SessionUser;
  projectId: string;
  visibility: ProjectVisibility;
  license: string | null;
}): Promise<Project> {
  const db = getDatabase();
  const project = await findProjectById(db, input.projectId);
  if (!project || !can(project, input.viewer, 'edit')) throw new AppError('not_found', 'No such project');

  const license = input.license?.trim() || null;
  await applyProjectVisibility(project, input.visibility, license);
  if (license !== project.license) {
    try {
      await syncProjectManifest({ ...project, visibility: input.visibility, license }, 'Update project license');
    } catch (error) {
      console.warn('could not update project.json with the new license', { projectId: project.id, error });
    }
  }
  return (await findProjectById(db, project.id)) ?? { ...project, visibility: input.visibility, license };
}

/** Pin a ready version as the one shown on the public page. */
export async function activateVersion(input: {
  viewer: SessionUser;
  projectId: string;
  versionId: string;
}): Promise<void> {
  const db = getDatabase();
  const project = await findProjectById(db, input.projectId);
  if (!project || !can(project, input.viewer, 'edit')) throw new AppError('not_found', 'No such project');

  const version = await findVersionById(db, input.versionId);
  if (!version || version.projectId !== project.id) throw new AppError('not_found', 'No such version');
  if (version.status !== 'ready') throw new AppError('validation_failed', 'Only a ready version can be active');

  const updated = await setActiveVersion(db, project.id, version.id);
  if (!updated) throw new AppError('validation_failed', 'Could not activate that version');
}
