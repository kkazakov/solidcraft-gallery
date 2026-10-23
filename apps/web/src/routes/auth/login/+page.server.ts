import { redirect, type RequestEvent } from '@sveltejs/kit';
import { currentViewer } from '../../../lib/server/auth.js';
import { inviteRequired, providerConfig, providerConfigured, safeRedirect } from '../../../lib/server/oauth.js';

export async function load(event: RequestEvent) {
  const requested = safeRedirect(event.url.searchParams.get('redirect'));
  // Never bounce a signed-in visitor back into the auth routes.
  const target = requested.startsWith('/auth/') ? '/dashboard' : requested;

  let viewer = null;
  try {
    viewer = await currentViewer(event);
  } catch {
    // Fall through to the sign-in page when the database is unavailable.
  }
  if (viewer) throw redirect(303, target);

  const forgejo = providerConfig('forgejo');
  const registrationUrl =
    forgejo && process.env.FORGEJO_DISABLE_REGISTRATION === 'false'
      ? `${new URL(forgejo.authorizeUrl).origin}/user/sign_up`
      : null;

  return {
    devLogin: process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production',
    redirect: target,
    invite: event.url.searchParams.get('invite') ?? '',
    error: event.url.searchParams.get('error') ?? '',
    inviteRequired: inviteRequired(),
    registrationUrl,
    providers: [{ id: 'forgejo', label: 'Forgejo', configured: providerConfigured('forgejo') }],
  };
}
