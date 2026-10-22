import { error } from '@sveltejs/kit';
import { providerConfig, startOAuth, type OAuthProviderId } from '../../../../lib/server/oauth.js';

const PROVIDERS = new Set<OAuthProviderId>(['forgejo', 'github']);

export function GET(event) {
  const provider = event.params.provider;
  if (!PROVIDERS.has(provider as OAuthProviderId)) throw error(404, 'Unknown provider');
  if (!providerConfig(provider)) throw error(501, `${provider} sign-in is not configured on this instance`);

  const target = startOAuth(
    event,
    provider as OAuthProviderId,
    event.url.searchParams.get('redirect'),
    event.url.searchParams.get('invite'),
  );
  // SvelteKit's redirect() rejects external locations; the provider URL is external by design.
  return new Response(null, { status: 303, headers: { location: target } });
}
