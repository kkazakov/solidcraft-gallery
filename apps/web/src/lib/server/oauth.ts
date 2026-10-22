import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import {
  consumeInvite,
  findOAuthIdentity,
  getDatabase,
  hashInviteCode,
  upsertOAuthUser,
  type SessionUser,
} from '@gallery/db';
import { applyConfiguredAdmin, isConfiguredAdmin, signIn } from './auth.js';

export type OAuthProviderId = 'forgejo' | 'github';

export interface OAuthProviderConfig {
  id: OAuthProviderId;
  label: string;
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  userUrl: string;
  scopes: string;
}

export interface OAuthTransaction {
  state: string;
  verifier: string;
  provider: OAuthProviderId;
  redirect: string;
  exp: number;
  /** Hex SHA-256 of an invite code, carried only across the OAuth round trip. */
  inviteHash?: string;
}

export interface OAuthProfile {
  subject: string;
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

const PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE = PRODUCTION ? '__Host-gallery_oauth' : 'gallery_oauth';
const MAX_AGE_SECONDS = 600;

function base(value: string): string {
  return value.replace(/\/+$/, '');
}

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

export function providerConfig(id: string): OAuthProviderConfig | null {
  if (id === 'forgejo') {
    const clientId = env('FORGEJO_CLIENT_ID');
    const clientSecret = env('FORGEJO_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;
    const publicBase = base(env('FORGEJO_URL') ?? 'http://localhost:3001');
    const serverBase = base(env('FORGEJO_INTERNAL_URL') ?? publicBase);
    return {
      id: 'forgejo',
      label: 'Forgejo',
      clientId,
      clientSecret,
      authorizeUrl: `${publicBase}/login/oauth/authorize`,
      tokenUrl: `${serverBase}/login/oauth/access_token`,
      userUrl: `${serverBase}/api/v1/user`,
      scopes: 'openid profile email repo',
    };
  }

  if (id === 'github') {
    const clientId = env('GITHUB_CLIENT_ID');
    const clientSecret = env('GITHUB_CLIENT_SECRET');
    if (!clientId || !clientSecret) return null;
    const apiBase = base(env('GITHUB_API_BASE') ?? 'https://api.github.com');
    return {
      id: 'github',
      label: 'GitHub',
      clientId,
      clientSecret,
      authorizeUrl: env('GITHUB_OAUTH_AUTHORIZE_URL') ?? 'https://github.com/login/oauth/authorize',
      tokenUrl: env('GITHUB_OAUTH_TOKEN_URL') ?? 'https://github.com/login/oauth/access_token',
      userUrl: env('GITHUB_USER_URL') ?? `${apiBase}/user`,
      scopes: 'read:user user:email public_repo',
    };
  }

  return null;
}

export function inviteRequired(): boolean {
  return process.env.INVITE_REQUIRED === '1';
}

export function providerConfigured(id: string): boolean {
  return providerConfig(id) !== null;
}

export function callbackUrl(event: RequestEvent, provider: OAuthProviderId): string {
  const origin = base(env('PUBLIC_ORIGIN') ?? event.url.origin);
  return `${origin}/auth/callback/${provider}`;
}

/** Only same-site, absolute-path redirects are accepted after a login. */
export function safeRedirect(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/dashboard';
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (code < 0x20 || code === 0x7f) return '/dashboard';
  }
  return value;
}

function oauthSecret(): string {
  const secret = env('SESSION_SECRET');
  if (secret && secret.length >= 16) return secret;
  if (PRODUCTION) throw new AppError('internal', 'SESSION_SECRET is not configured');
  return 'dev-oauth-secret-change-me';
}

export function encodeTransaction(transaction: OAuthTransaction): string {
  const body = Buffer.from(JSON.stringify(transaction), 'utf8').toString('base64url');
  const signature = createHmac('sha256', oauthSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function decodeTransaction(value: string): OAuthTransaction {
  const [body, signature, extra] = value.split('.');
  if (!body || !signature || extra) throw new AppError('unauthorized', 'Invalid sign-in transaction');

  const expected = createHmac('sha256', oauthSecret()).update(body).digest('base64url');
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new AppError('unauthorized', 'Invalid sign-in transaction');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('unauthorized', 'Invalid sign-in transaction');
  }
  if (typeof parsed !== 'object' || parsed === null) throw new AppError('unauthorized', 'Invalid sign-in transaction');

  const transaction = parsed as Partial<OAuthTransaction>;
  if (
    typeof transaction.state !== 'string' ||
    typeof transaction.verifier !== 'string' ||
    (transaction.provider !== 'forgejo' && transaction.provider !== 'github') ||
    typeof transaction.redirect !== 'string' ||
    typeof transaction.exp !== 'number' ||
    (transaction.inviteHash !== undefined && typeof transaction.inviteHash !== 'string')
  ) {
    throw new AppError('unauthorized', 'Invalid sign-in transaction');
  }
  if (transaction.exp < Date.now()) throw new AppError('unauthorized', 'The sign-in attempt expired');

  return transaction as OAuthTransaction;
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: pkceChallenge(verifier) };
}

function sameState(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Build the authorize URL and store the signed transaction cookie. */
export function startOAuth(
  event: RequestEvent,
  provider: OAuthProviderId,
  requestedRedirect: string | null,
  inviteCode: string | null = null,
): string {
  const config = providerConfig(provider);
  if (!config) throw new AppError('validation_failed', `${provider} sign-in is not configured`);

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(32).toString('base64url');
  const transaction: OAuthTransaction = {
    state,
    verifier,
    provider,
    redirect: safeRedirect(requestedRedirect),
    exp: Date.now() + MAX_AGE_SECONDS * 1000,
  };
  if (inviteCode?.trim()) {
    transaction.inviteHash = Buffer.from(hashInviteCode(inviteCode)).toString('hex');
  }

  event.cookies.set(COOKIE, encodeTransaction(transaction), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    maxAge: MAX_AGE_SECONDS,
  });

  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', callbackUrl(event, provider));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export async function exchangeCode(
  config: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  verifier: string,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError('upstream_unavailable', 'The sign-in provider did not answer');
  }

  if (!response.ok) throw new AppError('unauthorized', 'Sign-in failed');
  const body = (await response.json()) as { access_token?: unknown };
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) {
    throw new AppError('unauthorized', 'Sign-in failed');
  }
  return body.access_token;
}

export async function fetchProfile(config: OAuthProviderConfig, accessToken: string): Promise<OAuthProfile> {
  let response: Response;
  try {
    response = await fetch(config.userUrl, {
      headers: { accept: 'application/json', authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new AppError('upstream_unavailable', 'The sign-in provider did not answer');
  }
  if (!response.ok) throw new AppError('unauthorized', 'Sign-in failed');

  const data = (await response.json()) as {
    id?: unknown;
    login?: unknown;
    username?: unknown;
    full_name?: unknown;
    name?: unknown;
    email?: unknown;
    avatar_url?: unknown;
  };

  const id = data.id;
  const username = typeof data.login === 'string' ? data.login : data.username;
  if ((typeof id !== 'number' && typeof id !== 'string') || typeof username !== 'string') {
    throw new AppError('unauthorized', 'The provider returned an unexpected profile');
  }

  return {
    subject: String(id),
    username,
    displayName: typeof data.full_name === 'string' ? data.full_name : typeof data.name === 'string' ? data.name : '',
    email: typeof data.email === 'string' ? data.email : null,
    avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
  };
}

/** Complete the callback, create the session and return a relative redirect. */
export async function finishOAuth(event: RequestEvent, provider: OAuthProviderId): Promise<string> {
  const config = providerConfig(provider);
  if (!config) throw new AppError('validation_failed', `${provider} sign-in is not configured`);

  const code = event.url.searchParams.get('code');
  const state = event.url.searchParams.get('state');
  if (!code || !state) throw new AppError('unauthorized', 'Missing sign-in parameters');

  const raw = event.cookies.get(COOKIE);
  if (!raw) throw new AppError('unauthorized', 'Missing sign-in transaction');
  const transaction = decodeTransaction(raw);
  event.cookies.delete(COOKIE, { path: '/' });

  if (transaction.provider !== provider) throw new AppError('unauthorized', 'Sign-in provider mismatch');
  if (!sameState(state, transaction.state)) throw new AppError('unauthorized', 'Sign-in state mismatch');

  const accessToken = await exchangeCode(config, code, callbackUrl(event, provider), transaction.verifier);
  const profile = await fetchProfile(config, accessToken);

  const db = getDatabase();
  const existing = await findOAuthIdentity(db, provider, profile.subject);
  if (!existing && inviteRequired() && !isConfiguredAdmin(profile.username)) {
    if (!transaction.inviteHash) throw new AppError('forbidden', 'invite_required');
    const valid = await consumeInvite(db, Buffer.from(transaction.inviteHash, 'hex'));
    if (!valid) throw new AppError('forbidden', 'invite_required');
  }

  let user: SessionUser = await upsertOAuthUser(db, {
    provider,
    subject: profile.subject,
    username: profile.username,
    displayName: profile.displayName,
    email: profile.email,
    avatarUrl: profile.avatarUrl,
  });
  user = await applyConfiguredAdmin(user);

  await signIn(event, user.id);
  return safeRedirect(transaction.redirect);
}
