import { json } from '@sveltejs/kit';
import { AppError, can, canChangeVisibility } from '@gallery/core';
import { findProjectById, getDatabase, listVersions, type ProjectVisibility } from '@gallery/db';
import { currentViewer } from '../../../../../lib/server/auth.js';
import { errorResponse, readJson } from '../../../../../lib/server/http.js';
import { updateProjectDetails, updateProjectPublication } from '../../../../../lib/server/projects.js';

const VISIBILITIES = new Set<ProjectVisibility>(['public', 'unlisted', 'private']);

export async function PATCH(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const db = getDatabase();
    const project = await findProjectById(db, event.params.id);
    if (!project || !can(project, viewer, 'edit')) throw new AppError('not_found', 'No such project');

    const body = await readJson(event.request);
    const hasTitle = typeof body.title === 'string';
    const hasDescription = typeof body.description === 'string';
    const hasVisibility = body.visibility !== undefined;
    const hasLicense = body.license !== undefined;
    if (!hasTitle && !hasDescription && !hasVisibility && !hasLicense) {
      throw new AppError('validation_failed', 'Provide `title`, `description`, `visibility` and/or `license`');
    }

    const title = hasTitle ? String(body.title).trim() : project.title;
    const description = hasDescription ? String(body.description).trim() : project.description;
    const visibility = hasVisibility ? body.visibility : project.visibility;
    if (typeof visibility !== 'string' || !VISIBILITIES.has(visibility as ProjectVisibility)) {
      throw new AppError('validation_failed', '`visibility` must be public, unlisted or private');
    }

    const license =
      hasLicense && typeof body.license === 'string' && body.license.trim()
        ? body.license.trim()
        : hasLicense
          ? null
          : project.license;
    if (license && !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/.test(license)) {
      throw new AppError('validation_failed', '`license` must be an SPDX identifier');
    }

    if (hasTitle || hasDescription) {
      await updateProjectDetails({ viewer, projectId: project.id, title, description });
    }

    if (hasVisibility || hasLicense) {
      const versions = await listVersions(db, project.id, 1);
      const change = canChangeVisibility({
        from: project.visibility,
        to: visibility as ProjectVisibility,
        hasVersion: versions.length > 0,
        license,
      });
      if (!change.ok) throw new AppError('validation_failed', change.reason);

      await updateProjectPublication({
        viewer,
        projectId: project.id,
        visibility: visibility as ProjectVisibility,
        license,
      });
    }

    const refreshed = await findProjectById(db, project.id);
    return json({
      id: project.id,
      title: refreshed?.title ?? project.title,
      description: refreshed?.description ?? project.description,
      visibility: refreshed?.visibility ?? project.visibility,
      license: refreshed?.license ?? project.license,
    });
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
