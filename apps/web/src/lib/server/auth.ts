import type { RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { hashSessionToken, newSessionToken, sessionCookieName } from '@gallery/core';
import { LANGUAGE_COOKIE } from '../i18n/config.js';
import {
  createSession,
  deleteSession,
  findSessionUser,
  getDatabase,
  setUserAdmin,
  type SessionUser,
} from '@gallery/db';

const PRODUCTION = process.env.NODE_ENV === 'production';
const COOKIE = sessionCookieName(PRODUCTION);
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function clientAddress(event: RequestEvent): string | null {
  try {
    return event.getClientAddress();
  } catch {
    return null;
  }
}

/** Create a session row and set the cookie. The raw token never touches the database. */
export async function signIn(event: RequestEvent, userId: string): Promise<void> {
  const token = newSessionToken();
  await createSession(getDatabase(), userId, {
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + MAX_AGE_SECONDS * 1000),
    ip: clientAddress(event),
    userAgent: event.request.headers.get('user-agent'),
  });

  event.cookies.set(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: PRODUCTION,
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function currentViewer(event: RequestEvent): Promise<SessionUser | null> {
  const token = event.cookies.get(COOKIE);
  if (!token) return null;
  return findSessionUser(getDatabase(), hashSessionToken(token));
}

export async function requireViewer(event: RequestEvent): Promise<SessionUser> {
  const viewer = await currentViewer(event);
  if (!viewer) {
    const target = `${event.url.pathname}${event.url.search}`;
    throw redirect(303, `/auth/login?redirect=${encodeURIComponent(target)}`);
  }
  return viewer;
}

export async function signOut(event: RequestEvent): Promise<void> {
  const token = event.cookies.get(COOKIE);
  if (token) await deleteSession(getDatabase(), hashSessionToken(token));
  event.cookies.delete(COOKIE, { path: '/' });
  // The language preference belongs to the signed-in session: drop the cookie
  // so the next visit falls back to Accept-Language. The browser-owned copy is
  // cleared by the logout form before it navigates.
  event.cookies.delete(LANGUAGE_COOKIE, { path: '/' });
}

/** Same-origin check for state-changing form posts until the CSRF token lands. */
export function assertSameOrigin(event: RequestEvent): void {
  const origin = event.request.headers.get('origin');
  if (origin && origin !== event.url.origin) {
    throw redirect(303, '/');
  }
}

/** `ADMIN_USERNAMES` is a bootstrap allowlist; it is applied on each sign-in. */
export function isConfiguredAdmin(username: string): boolean {
  const configured = (process.env.ADMIN_USERNAMES ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(username.toLowerCase());
}

export async function applyConfiguredAdmin(user: SessionUser): Promise<SessionUser> {
  if (!isConfiguredAdmin(user.username)) return user;
  await setUserAdmin(getDatabase(), user.id);
  return { ...user, role: 'admin' };
}
