import { json } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { currentViewer } from '../../../../lib/server/auth.js';
import { connectGitHubRepo } from '../../../../lib/server/external.js';
import { errorResponse, readJson } from '../../../../lib/server/http.js';

export async function POST(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const body = await readJson(event.request);
    if (typeof body.url !== 'string' || body.url.trim().length === 0) {
      throw new AppError('validation_failed', '`url` is required');
    }

    const connected = await connectGitHubRepo({ viewer, url: body.url });
    return json(
      {
        project_id: connected.projectId,
        slug: connected.slug,
        owner: viewer.username,
        title: connected.title,
        design_path: connected.designPath,
        commit: connected.commit,
        provider: 'github',
        url: `/${viewer.username}/${connected.slug}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
