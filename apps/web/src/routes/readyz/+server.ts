import { json } from '@sveltejs/kit';
import { createDatabase } from '@gallery/db';

/**
 * Readiness: the process can serve traffic and reach the database. Kept
 * separate from /healthz so a liveness probe never restarts the app during a
 * short database blip.
 */
export async function GET() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    return json({ status: 'not_ready', reason: 'DATABASE_URL is not set' }, { status: 503 });
  }

  const db = createDatabase(url, { max: 1, connectTimeoutSeconds: 3 });
  try {
    await db`select 1`;
    return json({ status: 'ready' });
  } catch {
    return json({ status: 'not_ready', reason: 'database unavailable' }, { status: 503 });
  } finally {
    await db.end({ timeout: 2 });
  }
}
