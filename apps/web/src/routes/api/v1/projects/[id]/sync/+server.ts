import { json } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { currentViewer } from '../../../../../../lib/server/auth.js';
import { syncGitHubProject } from '../../../../../../lib/server/external.js';
import { errorResponse } from '../../../../../../lib/server/http.js';

export async function POST(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const result = await syncGitHubProject({ viewer, projectId: event.params.id });
    return json(
      {
        changed: result.changed,
        ...(result.commit ? { commit: result.commit } : {}),
        ...(result.versionId ? { version_id: result.versionId } : {}),
      },
      { status: result.changed ? 202 : 200 },
    );
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
