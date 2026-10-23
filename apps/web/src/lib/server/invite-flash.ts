import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';

const COOKIE = 'gallery_invite_flash';
const TTL_MS = 60_000;

export interface InviteFlash {
  code: string;
  uses: number;
  days: number;
  exp: number;
}

function flashSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required for invite flashes');
  }
  return 'dev-invite-flash-secret-change-me';
}

function sign(body: string): string {
  return createHmac('sha256', flashSecret()).update(body).digest('base64url');
}

/** Signed payload for the POST → redirect hand-off; never stored in the database. */
export function encodeInviteFlash(input: { code: string; uses: number; days: number }, now = Date.now()): string {
  const payload: InviteFlash = { ...input, exp: now + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${sign(body)}`;
}

export function decodeInviteFlash(raw: string, now = Date.now()): InviteFlash | null {
  const [body, signature, extra] = raw.split('.');
  if (!body || !signature || extra) return null;

  const expected = sign(body);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const flash = parsed as Partial<InviteFlash>;
  if (
    typeof flash.code !== 'string' ||
    typeof flash.uses !== 'number' ||
    typeof flash.days !== 'number' ||
    typeof flash.exp !== 'number' ||
    !Number.isFinite(flash.exp) ||
    flash.exp < now
  ) {
    return null;
  }
  return flash as InviteFlash;
}

export function setInviteFlash(event: RequestEvent, input: { code: string; uses: number; days: number }): void {
  event.cookies.set(COOKIE, encodeInviteFlash(input), {
    path: '/admin/invites',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: Math.ceil(TTL_MS / 1000),
  });
}

/** Read the flash once: delete the cookie whether or not the payload verifies. */
export function takeInviteFlash(event: RequestEvent): InviteFlash | null {
  const raw = event.cookies.get(COOKIE);
  if (!raw) return null;
  event.cookies.delete(COOKIE, { path: '/admin/invites' });
  return decodeInviteFlash(raw);
}
