import { error, type RequestEvent } from '@sveltejs/kit';
import type { Invite, SessionUser } from '@gallery/db';
import { requireViewer } from './auth.js';

export const USERS_PAGE_SIZE = 25;
export const INVITES_PAGE_SIZE = 20;
export const MAX_INVITE_USES = 1000;
export const MAX_INVITE_DAYS = 365;

/**
 * Admin pages are invisible resources: a signed-in non-admin gets the same 404
 * as an anonymous visitor, while anonymous visitors are sent to sign in.
 */
export async function requireAdmin(event: RequestEvent): Promise<SessionUser> {
  const viewer = await requireViewer(event);
  if (viewer.role !== 'admin') throw error(404, 'Not found');
  return viewer;
}

/** Parse `?page=N` without trusting the value; offsets stay bounded. */
export function parsePage(value: string | null | undefined): number {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10_000) : 1;
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function pageOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize;
}

export interface InviteFormValues {
  uses: string;
  days: string;
  note: string;
}

export type InviteFormError = 'uses' | 'days' | 'note';

export type InviteFormResult =
  | { ok: true; value: { uses: number; days: number; note: string } }
  | { ok: false; error: InviteFormError; values: InviteFormValues };

/**
 * Server-side validation for the one-time code form. Uses and expiry are whole
 * numbers; the note is optional and trimmed before it reaches the database.
 */
export function parseInviteForm(form: FormData): InviteFormResult {
  const uses = String(form.get('uses') ?? '').trim();
  const days = String(form.get('days') ?? '').trim();
  const note = String(form.get('note') ?? '').trim();
  const values = { uses, days, note };

  if (!/^\d+$/.test(uses)) return { ok: false, error: 'uses', values };
  const parsedUses = Number(uses);
  if (!Number.isSafeInteger(parsedUses) || parsedUses < 1 || parsedUses > MAX_INVITE_USES) {
    return { ok: false, error: 'uses', values };
  }

  if (!/^\d+$/.test(days)) return { ok: false, error: 'days', values };
  const parsedDays = Number(days);
  if (!Number.isSafeInteger(parsedDays) || parsedDays < 1 || parsedDays > MAX_INVITE_DAYS) {
    return { ok: false, error: 'days', values };
  }

  if (note.length > 200) return { ok: false, error: 'note', values };

  return { ok: true, value: { uses: parsedUses, days: parsedDays, note } };
}

export function inviteExpiry(days: number, now = Date.now()): Date {
  return new Date(now + days * 24 * 60 * 60 * 1000);
}

export type InviteState = 'active' | 'expired' | 'exhausted' | 'revoked';

/** Display state; the database only stores the facts. */
export function inviteState(
  invite: Pick<Invite, 'uses' | 'maxUses' | 'expiresAt' | 'revokedAt'>,
  now = new Date(),
): InviteState {
  if (invite.revokedAt) return 'revoked';
  if (invite.expiresAt && invite.expiresAt.getTime() <= now.getTime()) return 'expired';
  if (invite.uses >= invite.maxUses) return 'exhausted';
  return 'active';
}

export function registrationUrl(code: string): string {
  return `/auth/register?invite=${encodeURIComponent(code)}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
