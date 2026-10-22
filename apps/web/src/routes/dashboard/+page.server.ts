import { fail, redirect } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { getDatabase, listProjectsForOwner } from '@gallery/db';
import { requireViewer } from '../../lib/server/auth.js';
import { connectGitHubRepo } from '../../lib/server/external.js';
import { createHostedProject } from '../../lib/server/projects.js';

export async function load(event) {
  const viewer = await requireViewer(event);
  const projects = await listProjectsForOwner(getDatabase(), viewer.id);
  return { viewer, projects };
}

export const actions = {
  connect: async (event) => {
    const viewer = await requireViewer(event);
    const form = await event.request.formData();
    const url = String(form.get('url') ?? '').trim();

    let connected: { projectId: string };
    try {
      connected = await connectGitHubRepo({ viewer, url });
    } catch (error) {
      if (error instanceof AppError) return fail(error.status, { connect: true, message: error.message });
      return fail(500, { connect: true, message: 'Could not connect the repository' });
    }

    throw redirect(303, `/dashboard/projects/${connected.projectId}`);
  },

  create: async (event) => {
    const viewer = await requireViewer(event);
    const form = await event.request.formData();
    const title = String(form.get('title') ?? '').trim();
    const slug = String(form.get('slug') ?? '').trim();

    let project: { id: string };
    try {
      project = await createHostedProject({ viewer, title, ...(slug ? { slug } : {}) });
    } catch (error) {
      if (error instanceof AppError) return fail(error.status, { message: error.message });
      return fail(500, { message: 'Could not create the project' });
    }

    throw redirect(303, `/dashboard/projects/${project.id}`);
  },
};
