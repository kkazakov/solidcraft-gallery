import { getDatabase, listUsersForAdmin } from '@gallery/db';
import { pageCount, pageOffset, parsePage, requireAdmin, USERS_PAGE_SIZE } from '../../../lib/server/admin.js';

export async function load(event) {
  await requireAdmin(event);

  const requested = parsePage(event.url.searchParams.get('page'));
  const db = getDatabase();
  let result = await listUsersForAdmin(db, {
    limit: USERS_PAGE_SIZE,
    offset: pageOffset(requested, USERS_PAGE_SIZE),
  });

  const pages = pageCount(result.total, USERS_PAGE_SIZE);
  const page = Math.min(requested, pages);
  if (page !== requested) {
    result = await listUsersForAdmin(db, {
      limit: USERS_PAGE_SIZE,
      offset: pageOffset(page, USERS_PAGE_SIZE),
    });
  }

  return {
    users: result.items,
    total: result.total,
    page,
    pages,
  };
}
