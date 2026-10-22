import { AppError, LIMITS, can, parseProjectManifest, type ProjectManifest } from '@gallery/core';
import {
  countProjectsForOwner,
  createExternalProject,
  enqueueJob,
  findProjectById,
  findRepoById,
  getDatabase,
  insertVersion,
  listProjectSlugs,
  updateRepoHead,
  type SessionUser,
} from '@gallery/db';
import { leanDesign } from '@gallery/design';
import { GitHubClient, parseGitHubUrl, type GitHubRepoRef, type GitHubTreeEntry } from '@gallery/git';
import { artifactKey, sha256Hex, type LocalStorage } from '@gallery/storage';
import { storage } from './config.js';
import { uniqueProjectSlug } from './projects.js';

function defaultGitHub(): GitHubClient {
  return new GitHubClient({
    ...(process.env.GITHUB_API_BASE ? { apiBase: process.env.GITHUB_API_BASE } : {}),
    ...(process.env.GITHUB_RAW_BASE ? { rawBase: process.env.GITHUB_RAW_BASE } : {}),
    ...(process.env.GITHUB_TOKEN ? { token: process.env.GITHUB_TOKEN } : {}),
  });
}

export interface ExternalDeps {
  github?: GitHubClient;
  storage?: LocalStorage;
}

export interface ConnectResult {
  projectId: string;
  slug: string;
  title: string;
  designPath: string;
  commit: string;
}

interface LocatedDesign {
  manifest: ProjectManifest | null;
  designPath: string;
  entry: GitHubTreeEntry;
}

function safeRepoPath(path: string): string {
  if (
    path.length === 0 ||
    path.length > 255 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes('\0') ||
    path.split('/').some((part) => part === '..' || part === '' || part === '.')
  ) {
    throw new AppError('validation_failed', 'The repository contains an unsafe design path');
  }
  return path;
}

async function locateDesign(
  github: GitHubClient,
  ref: GitHubRepoRef,
  commit: string,
  tree: GitHubTreeEntry[],
): Promise<LocatedDesign> {
  const files = new Map(tree.filter((entry) => entry.type === 'blob').map((entry) => [entry.path, entry]));
  const projectEntry = files.get('project.json');
  let manifest: ProjectManifest | null = null;

  if (projectEntry) {
    if (projectEntry.size > 100_000) {
      throw new AppError('payload_too_large', 'project.json is larger than 100 KB');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(await github.file(ref, commit, 'project.json')));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('unprocessable_design', 'project.json is not valid JSON');
    }
    const result = parseProjectManifest(parsed);
    if (!result.ok) {
      throw new AppError('unprocessable_design', 'project.json does not match the manifest schema', {
        issues: result.issues.slice(0, 8),
      });
    }
    manifest = result.value;
  }

  const candidates = [...files.keys()].filter((path) => path.toLowerCase().endsWith('.solidcraft'));
  let designPath = manifest?.design;
  if (!designPath) {
    if (candidates.length === 0) {
      throw new AppError('not_found', 'No .solidcraft file found in the repository');
    }
    if (candidates.length > 1) {
      throw new AppError(
        'validation_failed',
        'More than one .solidcraft file; set `design` in project.json to choose one',
      );
    }
    designPath = candidates[0]!;
  }

  designPath = safeRepoPath(designPath);
  const entry = files.get(designPath);
  if (!entry) throw new AppError('not_found', `The design file ${designPath} does not exist at that commit`);
  if (entry.size > LIMITS.designBytes) {
    throw new AppError('payload_too_large', `The design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`);
  }
  return { manifest, designPath, entry };
}

/**
 * Connect a public GitHub repository. Only public metadata/raw endpoints are
 * used; the lean design is cached in artifact storage, so later rendering and
 * downloads do not depend on GitHub being reachable.
 */
export async function connectGitHubRepo(
  input: { viewer: SessionUser; url: string },
  deps: ExternalDeps = {},
): Promise<ConnectResult> {
  const github = deps.github ?? defaultGitHub();
  const store = deps.storage ?? storage;
  const db = getDatabase();

  const count = await countProjectsForOwner(db, input.viewer.id);
  if (count >= LIMITS.projectsPerUser) {
    throw new AppError('conflict', `the beta limit is ${LIMITS.projectsPerUser} projects per user`);
  }

  const ref = parseGitHubUrl(input.url);
  const repo = await github.repo(ref);
  const commit = await github.commit(ref, repo.defaultBranch);
  const tree = await github.tree(ref, commit.sha);
  const located = await locateDesign(github, ref, commit.sha, tree);
  const raw = await github.file(ref, commit.sha, located.designPath);
  const lean = leanDesign(raw);

  const sha = sha256Hex(lean);
  const designKey = artifactKey(sha, 'design.solidcraft');
  await store.put(designKey, lean);

  const held = await listProjectSlugs(db, input.viewer.id);
  const slug = uniqueProjectSlug(repo.name, held);
  const title = (located.manifest?.title ?? repo.name).slice(0, LIMITS.titleChars);
  const description = (located.manifest?.description ?? repo.description ?? '').slice(0, LIMITS.descriptionChars);
  const license = located.manifest?.license ?? null;
  const tags = located.manifest?.tags ?? [];

  let projectId: string;
  try {
    const created = await createExternalProject(db, {
      ownerId: input.viewer.id,
      ownerUsername: input.viewer.username,
      provider: 'github',
      externalId: repo.id,
      url: repo.url,
      defaultBranch: repo.defaultBranch,
      commitSha: commit.sha,
      slug,
      title,
      description,
      license,
      tags,
      designPath: located.designPath,
    });
    projectId = created.projectId;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AppError('conflict', 'This repository is already connected to the gallery');
    }
    throw error;
  }

  const versionId = await insertVersion(db, {
    projectId,
    commitSha: commit.sha,
    message: commit.message,
    authorName: commit.authorName || input.viewer.username,
    authoredAt: commit.authoredAt,
    designPath: located.designPath,
    designKey,
    designSha256: new Uint8Array(Buffer.from(sha, 'hex')),
    designBytes: lean.byteLength,
    lean: true,
  });
  await enqueueJob(db, 'version.render', { versionId }, { priority: 10 });

  return { projectId, slug, title, designPath: located.designPath, commit: commit.sha };
}

export async function syncGitHubProject(
  input: { viewer: SessionUser; projectId: string },
  deps: ExternalDeps = {},
): Promise<{ changed: boolean; commit?: string; versionId?: string }> {
  const github = deps.github ?? defaultGitHub();
  const store = deps.storage ?? storage;
  const db = getDatabase();

  const project = await findProjectById(db, input.projectId);
  if (!project || !can(project, input.viewer, 'publish')) {
    throw new AppError('not_found', 'No such project');
  }
  if (project.repoProvider !== 'github') {
    throw new AppError('validation_failed', 'This project does not use a GitHub source');
  }

  const repo = await findRepoById(db, project.repoId);
  if (!repo) throw new AppError('not_found', 'The source repository is missing');
  const ref = parseGitHubUrl(repo.url);
  const commit = await github.commit(ref, repo.defaultBranch);
  if (commit.sha === repo.lastCommitSha) return { changed: false };

  const tree = await github.tree(ref, commit.sha);
  const entry = tree.find((candidate) => candidate.type === 'blob' && candidate.path === project.designPath);
  if (!entry) {
    throw new AppError('not_found', `The design file ${project.designPath} no longer exists`);
  }
  if (entry.size > LIMITS.designBytes) {
    throw new AppError('payload_too_large', `The design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`);
  }

  const raw = await github.file(ref, commit.sha, project.designPath);
  const lean = leanDesign(raw);
  const sha = sha256Hex(lean);
  const designKey = artifactKey(sha, 'design.solidcraft');
  await store.put(designKey, lean);

  const versionId = await insertVersion(db, {
    projectId: project.id,
    commitSha: commit.sha,
    message: commit.message,
    authorName: commit.authorName || input.viewer.username,
    authoredAt: commit.authoredAt,
    designPath: project.designPath,
    designKey,
    designSha256: new Uint8Array(Buffer.from(sha, 'hex')),
    designBytes: lean.byteLength,
    lean: true,
  });
  await updateRepoHead(db, repo.id, commit.sha);
  await enqueueJob(db, 'version.render', { versionId }, { priority: 10 });

  return { changed: true, commit: commit.sha, versionId };
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
