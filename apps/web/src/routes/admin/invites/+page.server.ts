import { fail, redirect } from '@sveltejs/kit';
import { createInvite, deleteInvite, findInviteById, getDatabase, listInvitesPage } from '@gallery/db';
import {
  INVITES_PAGE_SIZE,
  inviteExpiry,
  inviteState,
  isUuid,
  pageCount,
  pageOffset,
  parseInviteForm,
  parsePage,
  registrationUrl,
  requireAdmin,
} from '../../../lib/server/admin.js';
import { assertSameOrigin } from '../../../lib/server/auth.js';
import { setInviteFlash, takeInviteFlash } from '../../../lib/server/invite-flash.js';

export async function load(event) {
  await requireAdmin(event);
  const flash = takeInviteFlash(event);

  const requested = parsePage(event.url.searchParams.get('page'));
  const db = getDatabase();
  let result = await listInvitesPage(db, {
    limit: INVITES_PAGE_SIZE,
    offset: pageOffset(requested, INVITES_PAGE_SIZE),
  });

  const pages = pageCount(result.total, INVITES_PAGE_SIZE);
  const page = Math.min(requested, pages);
  if (page !== requested) {
    result = await listInvitesPage(db, {
      limit: INVITES_PAGE_SIZE,
      offset: pageOffset(page, INVITES_PAGE_SIZE),
    });
  }

  const now = new Date();
  const confirmParam = event.url.searchParams.get('confirm') ?? '';
  const confirmInvite = isUuid(confirmParam) ? await findInviteById(db, confirmParam) : null;
  const notice =
    event.url.searchParams.get('deleted') === '1'
      ? 'deleted'
      : event.url.searchParams.get('missing') === '1' || (confirmParam && !confirmInvite)
        ? 'missing'
        : null;

  return {
    invites: result.items.map((invite) => ({ ...invite, state: inviteState(invite, now) })),
    total: result.total,
    page,
    pages,
    notice,
    created: flash ? { code: flash.code, url: registrationUrl(flash.code) } : null,
    confirmInvite: confirmInvite ? { ...confirmInvite, state: inviteState(confirmInvite, now) } : null,
  };
}

export const actions = {
  create: async (event) => {
    assertSameOrigin(event);
    const viewer = await requireAdmin(event);

    const form = await event.request.formData();
    const parsed = parseInviteForm(form);
    if (!parsed.ok) {
      return fail(400, { error: parsed.error, ...parsed.values });
    }

    const invite = await createInvite(getDatabase(), {
      createdBy: viewer.id,
      note: parsed.value.note,
      maxUses: parsed.value.uses,
      expiresAt: inviteExpiry(parsed.value.days),
    });

    // The POST response never contains the raw code: a signed, short-lived
    // cookie carries it across the redirect and the load consumes it once.
    setInviteFlash(event, {
      code: invite.code,
      uses: parsed.value.uses,
      days: parsed.value.days,
    });
    throw redirect(303, '/admin/invites');
  },

  delete: async (event) => {
    assertSameOrigin(event);
    await requireAdmin(event);

    const form = await event.request.formData();
    const id = String(form.get('id') ?? '');
    const page = parsePage(String(form.get('page') ?? '1'));
    const deleted = isUuid(id) ? await deleteInvite(getDatabase(), id) : null;

    throw redirect(303, `/admin/invites?page=${page}&${deleted ? 'deleted=1' : 'missing=1'}`);
  },
};
