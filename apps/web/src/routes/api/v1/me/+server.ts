import { json } from '@sveltejs/kit';
import { currentViewer } from '../../../../lib/server/auth';

export async function GET(event) {
  const viewer = await currentViewer(event);
  if (!viewer) {
    return json({ error: { code: 'unauthorized', message: 'Sign in first' } }, { status: 401 });
  }
  return json({ id: viewer.id, username: viewer.username, role: viewer.role });
}
