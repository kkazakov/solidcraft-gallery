import { fail, redirect } from '@sveltejs/kit';
import { AppError, COMMON_LICENSES, LIMITS, isCommonLicense } from '@gallery/core';
import { readDesign } from '@gallery/design';
import { findProjectById, getDatabase } from '@gallery/db';
import { translate, type MessageKey, type MessageParams } from '../../../../lib/i18n/messages.js';
import { requireViewer } from '../../../../lib/server/auth.js';
import { connectGitHubRepo } from '../../../../lib/server/external.js';
import { applyProjectVisibility, createHostedProject, publishDesign } from '../../../../lib/server/projects.js';

const TAG = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export async function load(event) {
  const viewer = await requireViewer(event);
  return { viewer, licenses: COMMON_LICENSES };
}

export const actions = {
  create: async (event) => {
    const viewer = await requireViewer(event);
    const t = (key: MessageKey, params?: MessageParams) => translate(event.locals.locale, key, params);
    const form = await event.request.formData();

    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const version = String(form.get('version') ?? '').trim();
    const requestedVisibility = String(form.get('visibility') ?? 'private');
    const visibility = requestedVisibility === 'public' ? 'public' : 'private';
    const submittedLicense = String(form.get('license') ?? '').trim();
    const license = visibility === 'public' ? submittedLicense : null;
    const design = form.get('design');

    const values = {
      title,
      description,
      version,
      visibility,
      license: submittedLicense,
      projectId: undefined as string | undefined,
    };
    const invalid = (message: string, status = 400) => fail(status, { create: true, ...values, message });

    if (title.length < 1 || title.length > LIMITS.titleChars) {
      return invalid(t('error.titleLength', { max: LIMITS.titleChars }));
    }
    if (description.length > LIMITS.descriptionChars) {
      return invalid(t('error.descriptionLength', { max: LIMITS.descriptionChars }));
    }
    if (version && !TAG.test(version)) {
      return invalid(t('error.version'));
    }
    if (requestedVisibility !== 'private' && requestedVisibility !== 'public') {
      return invalid(t('error.visibilityCreate'));
    }
    if (visibility === 'public' && !isCommonLicense(submittedLicense)) {
      return invalid(t('error.licenseRequired'));
    }
    if (!(design instanceof File) || design.size === 0) {
      return invalid(t('error.designRequired'));
    }
    if (design.size > LIMITS.designBytes) {
      return invalid(t('error.designTooLarge', { mb: LIMITS.designBytes / (1024 * 1024) }), 413);
    }

    const bytes = new Uint8Array(await design.arrayBuffer());
    try {
      readDesign(bytes);
    } catch (error) {
      if (error instanceof AppError) return invalid(error.message);
      throw error;
    }

    let project: { id: string; slug: string; owner: string };
    try {
      project = await createHostedProject({
        viewer,
        title,
        description,
        license: visibility === 'public' ? license : null,
      });
    } catch (error) {
      if (error instanceof AppError) return invalid(error.message, error.status);
      return invalid(t('error.createProject'), 500);
    }

    try {
      await publishDesign({
        viewer,
        projectId: project.id,
        bytes,
        ...(version ? { tag: version } : {}),
        message: version ? `Publish ${version}` : 'First version',
      });
    } catch (error) {
      const message = error instanceof AppError ? error.message : t('error.publishDesign');
      return fail(400, {
        create: true,
        ...values,
        projectId: project.id,
        message: t('error.publishProjectPartial', { message }),
      });
    }

    if (visibility === 'public') {
      try {
        const created = await findProjectById(getDatabase(), project.id);
        if (!created) throw new AppError('not_found', 'No such project');
        await applyProjectVisibility(created, 'public', license);
      } catch {
        return fail(400, {
          create: true,
          ...values,
          projectId: project.id,
          message: t('error.publicProjectPartial'),
        });
      }
    }

    throw redirect(303, `/dashboard/projects/${project.id}?created=1`);
  },

  connect: async (event) => {
    const viewer = await requireViewer(event);
    const t = (key: MessageKey, params?: MessageParams) => translate(event.locals.locale, key, params);
    const form = await event.request.formData();
    const url = String(form.get('url') ?? '').trim();

    let connected: { projectId: string };
    try {
      connected = await connectGitHubRepo({ viewer, url });
    } catch (error) {
      if (error instanceof AppError) return fail(error.status, { connect: true, message: error.message });
      return fail(500, { connect: true, message: t('error.connectRepository') });
    }

    throw redirect(303, `/dashboard/projects/${connected.projectId}`);
  },
};
