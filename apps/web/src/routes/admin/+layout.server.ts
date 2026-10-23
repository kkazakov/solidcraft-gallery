import { requireAdmin } from '../../lib/server/admin.js';

export async function load(event) {
  // Admin pages contain one-time secrets and account data. Keep the whole
  // subtree out of shared caches and search indexes.
  event.setHeaders({
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex',
  });
  const viewer = await requireAdmin(event);
  return { viewer };
}
