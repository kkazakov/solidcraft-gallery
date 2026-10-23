import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import { AppError } from '@gallery/core';
import { findUsableInvite, findUserByUsername, getDatabase, hashInviteCode, provisionInvitedUser } from '@gallery/db';
import { forgejoContext } from '../../../lib/server/forgejo.js';
import { inviteRequired } from '../../../lib/server/oauth.js';

const USERNAME = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEFAULT_EMAIL_DOMAIN = 'users.solidcraft.drun.net';

const ATTEMPT_WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, { count: number; resetAt: number }>();

/**
 * Invite codes are 128-bit, so guessing is impractical; the limit exists so a
 * leaked link cannot be used to mass-create accounts from one address.
 */
function clientKey(event: RequestEvent): string {
  const forwarded = event.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  if (attempts.size > 5_000) attempts.clear();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

async function inviteIsUsable(invite: string): Promise<boolean> {
  if (!invite) return false;
  try {
    return await findUsableInvite(getDatabase(), Buffer.from(hashInviteCode(invite)));
  } catch {
    return false;
  }
}

export async function load(event: RequestEvent) {
  const invite = (event.url.searchParams.get('invite') ?? '').trim();
  const usable = await inviteIsUsable(invite);

  return {
    invite,
    usable,
    inviteRequired: inviteRequired(),
    forgejoReady: forgejoContext() !== null,
  };
}

export const actions = {
  default: async (event: RequestEvent) => {
    if (!inviteRequired()) return fail(400, { error: 'closed' as const });
    if (rateLimited(clientKey(event))) return fail(429, { error: 'rate' as const });

    const form = await event.request.formData();
    const invite = String(form.get('invite') ?? '').trim();
    const username = String(form.get('username') ?? '')
      .trim()
      .toLowerCase();
    const email = String(form.get('email') ?? '')
      .trim()
      .toLowerCase();
    const password = String(form.get('password') ?? '');
    const values = { invite, username, email };

    if (!invite) return fail(400, { error: 'invite' as const, ...values });
    if (!USERNAME.test(username)) return fail(400, { error: 'username-format' as const, ...values });
    if (email && !EMAIL.test(email)) return fail(400, { error: 'email-format' as const, ...values });
    if (password.length < 8 || password.length > 128) {
      return fail(400, { error: 'password' as const, ...values });
    }

    const context = forgejoContext();
    if (!context) return fail(503, { error: 'unavailable' as const, ...values });

    const db = getDatabase();
    const codeHash = Buffer.from(hashInviteCode(invite));
    if (!(await findUsableInvite(db, codeHash))) return fail(400, { error: 'invite' as const, ...values });
    if (await findUserByUsername(db, username)) {
      return fail(409, { error: 'username-taken' as const, ...values });
    }

    let providerUser: { id: number; login: string };
    try {
      if (await context.client.findUser(username)) {
        return fail(409, { error: 'username-taken' as const, ...values });
      }
      providerUser = await context.client.createUser({
        username,
        email: email || `${username}@${(process.env.BETA_EMAIL_DOMAIN ?? '').trim() || DEFAULT_EMAIL_DOMAIN}`,
        password,
      });
    } catch (createError) {
      const detail = createError instanceof AppError ? createError.message : 'Forgejo did not create the account';
      return fail(502, { error: 'provider' as const, detail, ...values });
    }

    try {
      const created = await provisionInvitedUser(db, {
        codeHash,
        provider: 'forgejo',
        subject: String(providerUser.id),
        username: providerUser.login.toLowerCase(),
        email: email || null,
        displayName: providerUser.login,
      });
      if (!created) {
        await context.client.deleteUser(username).catch(() => {});
        return fail(400, { error: 'invite' as const, ...values });
      }
    } catch {
      // The provider account exists before the gallery rows, so undo it when the
      // transaction fails; the user can retry with the same invite.
      await context.client.deleteUser(username).catch(() => {});
      return fail(500, { error: 'failed' as const, ...values });
    }

    throw redirect(303, '/auth/login?registered=1');
  },
};
