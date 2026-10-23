export type Visibility = 'public' | 'unlisted' | 'private';
export type Role = 'user' | 'admin';
export type ProjectStatus = 'pending' | 'indexing' | 'ready' | 'error' | 'quarantined';

export interface Viewer {
  id: string;
  role: Role;
}

export interface ProjectAccess {
  ownerId: string;
  visibility: Visibility;
  status: ProjectStatus;
}

export type Action = 'view' | 'edit' | 'publish' | 'delete' | 'download';

/**
 * One authorization function for every project action. Handlers must call it;
 * a route that loads a project by id without it fails review. Invisible
 * resources are reported as 404 by the caller, not 403.
 */
export function can(project: ProjectAccess, viewer: Viewer | null, action: Action): boolean {
  const isOwner = viewer !== null && viewer.id === project.ownerId;
  const isAdmin = viewer?.role === 'admin';

  if (isAdmin) return true;

  switch (action) {
    case 'view':
    case 'download':
      if (project.status === 'quarantined') return isOwner;
      if (project.visibility === 'private') return isOwner;
      return project.status === 'ready';
    case 'edit':
    case 'publish':
      return isOwner && project.status !== 'quarantined';
    case 'delete':
      return isOwner;
    default:
      return false;
  }
}

export interface VisibilityChangeInput {
  from: Visibility;
  to: Visibility;
  hasVersion: boolean;
  license: string | null;
}

export type VisibilityChange = { ok: true } | { ok: false; reason: string };

/**
 * Rules from docs/03-repo-format.md: a public project needs a published version
 * and a license. The version may still be rendering; the public listing and the
 * project page stay hidden until it is ready.
 */
export function canChangeVisibility(input: VisibilityChangeInput): VisibilityChange {
  if (input.from === input.to) return { ok: true };

  if (input.to === 'public') {
    if (!input.hasVersion) return { ok: false, reason: 'a public project needs a published version' };
    if (!input.license) return { ok: false, reason: 'a public project needs an SPDX license' };
  }

  return { ok: true };
}
