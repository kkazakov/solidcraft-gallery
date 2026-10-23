import { AppError } from '@gallery/core';
import { findRepoById, getDatabase, type Project } from '@gallery/db';
import { ForgejoClient } from '@gallery/git';

export interface ForgejoContext {
  client: ForgejoClient;
  publicUrl: string;
}

/**
 * Browser-facing Forgejo base URL, without a trailing slash. Compose passes
 * `FORGEJO_PUBLIC_URL` to the web tier as `FORGEJO_URL`, so accept both and let
 * the explicitly public name win. Returns null when Forgejo is not configured,
 * so callers can hide links to it instead of rendering a broken one.
 */
export function forgejoPublicUrl(): string | null {
  const url = process.env.FORGEJO_PUBLIC_URL?.trim() || process.env.FORGEJO_URL?.trim();
  return url ? url.replace(/\/+$/, '') : null;
}

/**
 * Provisioning is intentionally server-side: the admin token creates private
 * repositories and adds the signed-in Forgejo user as a collaborator. User OAuth
 * tokens are not persisted yet.
 */
export function forgejoContext(): ForgejoContext | null {
  const token = process.env.FORGEJO_ADMIN_TOKEN?.trim();
  if (!token) return null;

  const internal = process.env.FORGEJO_INTERNAL_URL?.trim() || process.env.FORGEJO_URL?.trim() || 'http://forgejo:3000';
  const publicUrl = forgejoPublicUrl() ?? internal;

  return { client: new ForgejoClient({ baseUrl: internal, publicUrl, token }), publicUrl };
}

export function splitExternalId(externalId: string): { owner: string; repo: string } {
  const parts = externalId.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError('validation_failed', 'The Forgejo repository identifier is malformed');
  }
  return { owner: parts[0]!, repo: parts[1]! };
}

export async function forgejoForProject(project: Project): Promise<{
  client: ForgejoClient;
  owner: string;
  repo: string;
}> {
  const context = forgejoContext();
  if (!context) throw new AppError('internal', 'Forgejo provisioning is not configured');

  const repo = await findRepoById(getDatabase(), project.repoId);
  if (!repo || repo.provider !== 'forgejo') {
    throw new AppError('validation_failed', 'This project does not use the Forgejo backend');
  }
  const ref = splitExternalId(repo.externalId);
  return { client: context.client, owner: ref.owner, repo: ref.repo };
}
