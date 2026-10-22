import { error, fail, redirect } from '@sveltejs/kit';
import { AppError, can, LIMITS } from '@gallery/core';
import { findProjectById, getDatabase, listVersions } from '@gallery/db';
import { requireViewer } from '../../../../lib/server/auth.js';
import { publishDesign } from '../../../../lib/server/projects.js';

export async function load(event) {
  const viewer = await requireViewer(event);
  const project = await findProjectById(getDatabase(), event.params.id);
  if (!project || !can(project, viewer, 'edit')) throw error(404, 'Not found');
  const versions = await listVersions(getDatabase(), project.id);
  return { viewer, project, versions };
}

export const actions = {
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
