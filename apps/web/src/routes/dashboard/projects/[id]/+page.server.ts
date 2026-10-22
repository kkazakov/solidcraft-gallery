import { error, fail, redirect } from '@sveltejs/kit';
import { AppError, can, canChangeVisibility, LIMITS } from '@gallery/core';
import { findProjectById, getDatabase, latestReadyVersion, listVersions, type ProjectVisibility } from '@gallery/db';
import { requireViewer } from '../../../../lib/server/auth.js';
import { syncGitHubProject } from '../../../../lib/server/external.js';
import { applyProjectVisibility, publishDesign } from '../../../../lib/server/projects.js';

export async function load(event) {
  const viewer = await requireViewer(event);
  const project = await findProjectById(getDatabase(), event.params.id);
  if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');
  const versions = await listVersions(getDatabase(), project.id);
  return { viewer, project, versions };
}

const VISIBILITIES = new Set<ProjectVisibility>(['public', 'unlisted', 'private']);

export const actions = {
  settings: async (event) => {
    const viewer = await requireViewer(event);
    const project = await findProjectById(getDatabase(), event.params.id);
    if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');

    const form = await event.request.formData();
    const visibility = String(form.get('visibility') ?? '');
    const license = String(form.get('license') ?? '').trim();
    if (!VISIBILITIES.has(visibility as ProjectVisibility)) {
      return fail(400, { settings: true, message: 'Choose public, unlisted or private' });
    }
    if (license && !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/.test(license)) {
      return fail(400, { settings: true, message: 'License must be an SPDX identifier, for example CC-BY-4.0' });
    }

    const latest = await latestReadyVersion(getDatabase(), project.id);
    const change = canChangeVisibility({
      from: project.visibility,
      to: visibility as ProjectVisibility,
      hasReadyVersion: latest !== null,
      license: license || project.license,
    });
    if (!change.ok) return fail(400, { settings: true, message: change.reason });

    await applyProjectVisibility(project, visibility as ProjectVisibility, license || project.license);
    return { settings: true, ok: true, message: 'Saved' };
  },

  sync: async (event) => {
    const viewer = await requireViewer(event);
    const project = await findProjectById(getDatabase(), event.params.id);
    if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');
    if (project.repoProvider === 'local') {
      return fail(400, { sync: true, message: 'Local projects are published from this page' });
    }

    try {
      const result = await syncGitHubProject({ viewer, projectId: project.id });
      return {
        sync: true,
        ok: true,
        message: result.changed ? 'Sync queued; the preview will refresh shortly' : 'Already up to date',
      };
    } catch (syncError) {
      if (syncError instanceof AppError) return fail(syncError.status, { sync: true, message: syncError.message });
      return fail(500, { sync: true, message: 'Could not sync the repository' });
    }
  },

  publish: async (event) => {
    const viewer = await requireViewer(event);
    const project = await findProjectById(getDatabase(), event.params.id);
    if (!project || !can(project, viewer, 'publish')) throw error(404, 'Not found');

    const form = await event.request.formData();
    const design = form.get('design');
    if (!(design instanceof File) || design.size === 0) {
      return fail(400, { message: 'Choose a .solidcraft file to publish' });
    }
    if (design.size > LIMITS.designBytes) {
      return fail(413, { message: `The design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB` });
    }

    const tag = String(form.get('tag') ?? '').trim();
    const message = String(form.get('message') ?? '').trim();

    try {
      await publishDesign({
        viewer,
        projectId: project.id,
        bytes: new Uint8Array(await design.arrayBuffer()),
        ...(tag ? { tag } : {}),
        ...(message ? { message } : {}),
      });
    } catch (publishError) {
      if (publishError instanceof AppError) return fail(publishError.status, { message: publishError.message });
      return fail(500, { message: 'Could not publish the design' });
    }

    throw redirect(303, `/${project.ownerUsername}/${project.slug}`);
  },
};
