import { error, redirect } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { finishOAuth, providerConfig, type OAuthProviderId } from '../../../../lib/server/oauth.js';

const PROVIDERS = new Set<OAuthProviderId>(['forgejo', 'github']);

export async function GET(event) {
  const provider = event.params.provider;
  if (!PROVIDERS.has(provider as OAuthProviderId)) throw error(404, 'Unknown provider');
  if (!providerConfig(provider)) throw error(501, `${provider} sign-in is not configured on this instance`);

  if (event.url.searchParams.get('error')) throw error(400, 'Sign-in was cancelled');

  let target: string;
  try {
    target = await finishOAuth(event, provider as OAuthProviderId);
  } catch (callbackError) {
    if (callbackError instanceof AppError) {
      console.error('oauth callback failed', { code: callbackError.code });
      throw error(400, 'Sign-in failed');
    }
    throw callbackError;
  }

  throw redirect(303, target);
}
