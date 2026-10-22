import { error, redirect } from '@sveltejs/kit';
import { isValidSlug } from '@gallery/core';
import { ensureDevUser, getDatabase } from '@gallery/db';
import { applyConfiguredAdmin, signIn } from '../../../lib/server/auth';

/**
 * Development-only account creation. Never enabled in production; the check is
 * here, not only in the UI, so the route cannot be reached by URL.
 */
export async function GET(event) {
  if (process.env.DEV_LOGIN !== '1' || process.env.NODE_ENV === 'production') {
    throw error(404, 'Not found');
  }

  const username = (event.url.searchParams.get('username') ?? 'dev').trim().toLowerCase();
  if (!isValidSlug(username)) {
    throw error(400, 'username must be 3-64 lowercase letters, digits and hyphens');
  }

  const user = await applyConfiguredAdmin(await ensureDevUser(getDatabase(), username));
  await signIn(event, user.id);
  throw redirect(303, '/dashboard');
}
