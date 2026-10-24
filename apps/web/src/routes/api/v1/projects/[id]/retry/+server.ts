import { json } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { currentViewer } from '../../../../../../lib/server/auth.js';
import { errorResponse } from '../../../../../../lib/server/http.js';
import { retryVersion } from '../../../../../../lib/server/projects.js';

/** Retry the latest failed version. `409` when there is nothing to retry. */
export async function POST(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const versionId = await retryVersion({ viewer, projectId: event.params.id });
    return json({ ok: true, versionId }, { status: 202 });
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
