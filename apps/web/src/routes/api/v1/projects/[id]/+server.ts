import { json } from '@sveltejs/kit';
import { AppError, can, canChangeVisibility } from '@gallery/core';
import { findProjectById, getDatabase, latestReadyVersion, type ProjectVisibility } from '@gallery/db';
import { currentViewer } from '../../../../../lib/server/auth.js';
import { errorResponse, readJson } from '../../../../../lib/server/http.js';
import { applyProjectVisibility } from '../../../../../lib/server/projects.js';

const VISIBILITIES = new Set<ProjectVisibility>(['public', 'unlisted', 'private']);

export async function PATCH(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const db = getDatabase();
    const project = await findProjectById(db, event.params.id);
    if (!project || !can(project, viewer, 'edit')) throw new AppError('not_found', 'No such project');

    const body = await readJson(event.request);
    const visibility = body.visibility;
    if (typeof visibility !== 'string' || !VISIBILITIES.has(visibility as ProjectVisibility)) {
      throw new AppError('validation_failed', '`visibility` must be public, unlisted or private');
    }

    const license = typeof body.license === 'string' && body.license.trim() ? body.license.trim() : project.license;
    if (license && !/^[A-Za-z0-9][A-Za-z0-9.+-]{0,63}$/.test(license)) {
      throw new AppError('validation_failed', '`license` must be an SPDX identifier');
    }

    const latest = await latestReadyVersion(db, project.id);
    const change = canChangeVisibility({
      from: project.visibility,
      to: visibility as ProjectVisibility,
      hasReadyVersion: latest !== null,
      license,
    });
    if (!change.ok) throw new AppError('validation_failed', change.reason);

    await applyProjectVisibility(project, visibility as ProjectVisibility, license);
    return json({ id: project.id, visibility, license });
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
