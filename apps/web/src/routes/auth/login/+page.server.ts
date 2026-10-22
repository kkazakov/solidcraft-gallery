import { inviteRequired, providerConfig, providerConfigured } from '../../../lib/server/oauth.js';

export function load({ url }: { url: URL }) {
  const forgejo = providerConfig('forgejo');
  const registrationUrl =
    forgejo && process.env.FORGEJO_DISABLE_REGISTRATION === 'false'
      ? `${new URL(forgejo.authorizeUrl).origin}/user/sign_up`
      : null;

  return {
    devLogin: process.env.DEV_LOGIN === '1' && process.env.NODE_ENV !== 'production',
    redirect: url.searchParams.get('redirect') ?? '/dashboard',
    invite: url.searchParams.get('invite') ?? '',
    inviteRequired: inviteRequired(),
    error: url.searchParams.get('error') ?? '',
    registrationUrl,
    providers: [
      { id: 'forgejo', label: 'Forgejo', configured: providerConfigured('forgejo') },
      { id: 'github', label: 'GitHub', configured: providerConfigured('github') },
    ],
  };
}
