import { json } from '@sveltejs/kit';
import { AppError, LIMITS } from '@gallery/core';
import { currentViewer } from '../../../../../../lib/server/auth.js';
import { errorResponse } from '../../../../../../lib/server/http.js';
import { publishDesign } from '../../../../../../lib/server/projects.js';

export async function POST(event) {
  try {
    const viewer = await currentViewer(event);
    if (!viewer) throw new AppError('unauthorized', 'Sign in first');

    const form = await event.request.formData();
    const design = form.get('design');
    if (!(design instanceof File)) throw new AppError('validation_failed', '`design` must be a file');
    if (design.size === 0) throw new AppError('validation_failed', 'the design file is empty');
    if (design.size > LIMITS.designBytes) {
      throw new AppError('payload_too_large', `design is larger than ${LIMITS.designBytes / (1024 * 1024)} MB`);
    }

    const tag = form.get('tag');
    const message = form.get('message');
    const bytes = new Uint8Array(await design.arrayBuffer());

    const result = await publishDesign({
      viewer,
      projectId: event.params.id,
      bytes,
      ...(typeof tag === 'string' && tag.trim() ? { tag: tag.trim() } : {}),
      ...(typeof message === 'string' && message.trim() ? { message: message.trim() } : {}),
    });

    return json({ version_id: result.versionId, commit: result.commit, status: 'pending' }, { status: 202 });
  } catch (error) {
    return errorResponse(error, event.locals.requestId);
  }
}
