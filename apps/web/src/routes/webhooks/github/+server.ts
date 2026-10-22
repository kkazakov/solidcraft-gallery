import { json } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { findProjectByRepoId, findRepoByExternalId, findUserById, getDatabase } from '@gallery/db';
import { syncGitHubProject } from '../../../lib/server/external.js';
import { errorResponse } from '../../../lib/server/http.js';
import { parseGitHubPush, verifyGitHubSignature } from '../../../lib/server/webhooks.js';

const MAX_BODY_BYTES = 1_000_000;
const ZERO_SHA = /^0+$/;

export async function POST(event) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    return json(
      { error: { code: 'internal', message: 'GitHub webhooks are not configured on this instance' } },
      { status: 503 },
    );
  }

  const declared = Number(event.request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return json({ error: { code: 'payload_too_large', message: 'Webhook body is too large' } }, { status: 413 });
  }

  const raw = await event.request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return json({ error: { code: 'payload_too_large', message: 'Webhook body is too large' } }, { status: 413 });
  }

  if (!verifyGitHubSignature(secret, raw, event.request.headers.get('x-hub-signature-256'))) {
    return json({ error: { code: 'unauthorized', message: 'Invalid webhook signature' } }, { status: 401 });
  }

  const eventName = event.request.headers.get('x-github-event');
  if (eventName === 'ping') return json({ ok: true }, { status: 202 });
  if (eventName !== 'push') return json({ ignored: true }, { status: 202 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return json({ error: { code: 'validation_failed', message: 'Invalid JSON body' } }, { status: 400 });
  }

  const push = parseGitHubPush(payload);
  if (!push) return json({ error: { code: 'validation_failed', message: 'Invalid push payload' } }, { status: 400 });
  if (push.deleted || ZERO_SHA.test(push.after)) return json({ ignored: true }, { status: 202 });

  try {
    const db = getDatabase();
    // Resolve by repository id, never by a URL or name supplied in the payload.
    const repo = await findRepoByExternalId(db, 'github', push.repositoryId);
    if (!repo || repo.provider !== 'github') return json({ ignored: true }, { status: 202 });
    if (push.ref !== `refs/heads/${repo.defaultBranch}`) return json({ ignored: true }, { status: 202 });
    if (push.after === repo.lastCommitSha) return json({ changed: false }, { status: 200 });

    const project = await findProjectByRepoId(db, repo.id);
    const viewer = await findUserById(db, repo.ownerId);
    if (!project || !viewer) return json({ ignored: true }, { status: 202 });

    const result = await syncGitHubProject({ viewer, projectId: project.id });
    return json(
      {
        changed: result.changed,
        ...(result.commit ? { commit: result.commit } : {}),
        ...(result.versionId ? { version_id: result.versionId } : {}),
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof AppError) return errorResponse(error, event.locals.requestId);
    return errorResponse(error, event.locals.requestId);
  }
}
