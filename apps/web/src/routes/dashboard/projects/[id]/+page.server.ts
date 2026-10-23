import { error, fail, redirect } from '@sveltejs/kit';
import { AppError, COMMON_LICENSES, LIMITS, can, canChangeVisibility, isCommonLicense } from '@gallery/core';
import { readDesign } from '@gallery/design';
import { findProjectById, getDatabase, latestReadyVersion, listVersions, type ProjectVisibility } from '@gallery/db';
import { requireViewer } from '../../../../lib/server/auth.js';
import { syncGitHubProject } from '../../../../lib/server/external.js';
import {
  activateVersion,
  publishDesign,
  updateProjectDetails,
  updateProjectPublication,
} from '../../../../lib/server/projects.js';

const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const VISIBILITIES = new Set<ProjectVisibility>(['public', 'unlisted', 'private']);

export async function load(event) {
  const viewer = await requireViewer(event);
  const project = await findProjectById(getDatabase(), event.params.id);
  if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');
  const versions = await listVersions(getDatabase(), project.id);
  const latest = await latestReadyVersion(getDatabase(), project.id);
  const activeVersionId = project.activeVersionId ?? latest?.id ?? null;
  const licenses = [...COMMON_LICENSES];
  if (project.license && !isCommonLicense(project.license)) {
    licenses.unshift({ id: project.license, name: `${project.license} (current)` });
  }
  return {
    viewer,
    project,
    versions,
    activeVersionId,
    licenses,
    saved: event.url.searchParams.get('saved'),
    created: event.url.searchParams.get('created') === '1',
  };
}

export const actions = {
  details: async (event) => {
    const viewer = await requireViewer(event);
    const db = getDatabase();
    const project = await findProjectById(db, event.params.id);
    if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');

    const form = await event.request.formData();
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const requestedVisibility = String(form.get('visibility') ?? project.visibility);
    const submittedLicense = String(form.get('license') ?? '').trim();
    const visibility = VISIBILITIES.has(requestedVisibility as ProjectVisibility)
      ? (requestedVisibility as ProjectVisibility)
      : project.visibility;
    const license = visibility === 'private' ? null : submittedLicense || null;
    const values = { title, description, visibility, license: submittedLicense };
    const invalid = (message: string, status = 400) => fail(status, { details: true, ...values, message });

    if (title.length < 1 || title.length > LIMITS.titleChars) {
      return invalid(`Title must be 1–${LIMITS.titleChars} characters`);
    }
    if (description.length > LIMITS.descriptionChars) {
      return invalid(`Description must be at most ${LIMITS.descriptionChars} characters`);
    }
    if (!VISIBILITIES.has(requestedVisibility as ProjectVisibility)) {
      return invalid('Visibility must be private, unlisted or public');
    }
    if (visibility === 'public' && !license) {
      return invalid('Choose a license before making the project public');
    }
    if (license && !isCommonLicense(license) && license !== project.license) {
      return invalid('Choose a license from the list');
    }

    const versions = await listVersions(db, project.id, 1);
    const change = canChangeVisibility({
      from: project.visibility,
      to: visibility,
      hasVersion: versions.length > 0,
      license,
    });
    if (!change.ok) return invalid(change.reason);

    try {
      await updateProjectDetails({ viewer, projectId: project.id, title, description });
      await updateProjectPublication({ viewer, projectId: project.id, visibility, license });
    } catch (updateError) {
      if (updateError instanceof AppError) return invalid(updateError.message, updateError.status);
      return invalid('Could not save the project', 500);
    }

    throw redirect(303, `${event.url.pathname}?saved=details`);
  },

  publish: async (event) => {
    const viewer = await requireViewer(event);
    const project = await findProjectById(getDatabase(), event.params.id);
    if (!project || !can(project, viewer, 'publish')) throw error(404, 'Not found');
    if (project.repoProvider === 'github') {
      return fail(400, {
        publish: true,
        message: 'GitHub projects are read-only here. Push to GitHub and sync.',
        version: '',
      });
    }

    const form = await event.request.formData();
    const design = form.get('design');
    const version = String(form.get('version') ?? '').trim();
    const invalid = (message: string, status = 400) =>
      fail(status, { publish: true, message, version });

    if (!(design instanceof File) || design.size === 0) {
      return invalid('Choose a .solidcraft file to publish');
    }
    if (design.size > LIMITS.designBytes) {
      return invalid(`The design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`, 413);
    }
    if (version && !TAG.test(version)) {
      return invalid('Version must be 1–64 letters, digits, dots, underscores or hyphens');
    }

    const bytes = new Uint8Array(await design.arrayBuffer());
    try {
      readDesign(bytes);
    } catch (readError) {
      if (readError instanceof AppError) return invalid(readError.message, readError.status);
      throw readError;
    }

    try {
      await publishDesign({
        viewer,
        projectId: project.id,
        bytes,
        ...(version ? { tag: version } : {}),
        message: version ? `Publish ${version}` : 'New version',
      });
    } catch (publishError) {
      if (publishError instanceof AppError) return invalid(publishError.message, publishError.status);
      return invalid('Could not publish the design', 500);
    }

    throw redirect(303, `${event.url.pathname}?saved=version`);
  },

  activate: async (event) => {
    const viewer = await requireViewer(event);
    const form = await event.request.formData();
    const versionId = String(form.get('versionId') ?? '');

    try {
      await activateVersion({ viewer, projectId: event.params.id, versionId });
    } catch (activateError) {
      if (activateError instanceof AppError) {
        return fail(activateError.status, { activate: true, message: activateError.message });
      }
      return fail(500, { activate: true, message: 'Could not change the active version' });
    }

    throw redirect(303, `${event.url.pathname}?saved=active`);
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
};
