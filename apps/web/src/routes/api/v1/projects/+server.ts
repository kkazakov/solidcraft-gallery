import { json } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { currentViewer } from '../../../../lib/server/auth.js';
import { errorResponse, readJson } from '../../../../lib/server/http.js';
import { createHostedProject } from '../../../../lib/server/projects.js';

export async function POST(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const body = await readJson(event.request);
    if (body.mode !== undefined && body.mode !== 'hosted') {
      throw new AppError('validation_failed', 'only hosted projects can be created in this milestone');
    }
    if (typeof body.title !== 'string') throw new AppError('validation_failed', '`title` is required');
    if (body.slug !== undefined && typeof body.slug !== 'string') {
      throw new AppError('validation_failed', '`slug` must be a string');
    }

    const project = await createHostedProject({ viewer, title: body.title, slug: body.slug });
    return json(
      {
        id: project.id,
        owner: project.owner,
        slug: project.slug,
        url: `/${project.owner}/${project.slug}`,
        status: 'pending',
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
