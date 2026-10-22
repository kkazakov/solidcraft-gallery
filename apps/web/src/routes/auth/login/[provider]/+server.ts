import { error } from '@sveltejs/kit';

const CONFIGURED = new Set(['forgejo', 'github']);

/** Placeholder until the OAuth exchange lands; a clear 501 beats a broken redirect. */
export function GET({ params }: { params: { provider: string } }) {
  if (!CONFIGURED.has(params.provider)) throw error(404, 'Unknown provider');
  throw error(501, `${params.provider} sign-in is not configured yet`);
}
