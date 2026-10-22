import { requireViewer } from '../../lib/server/auth';

export async function load(event) {
  const viewer = await requireViewer(event);
  return { viewer };
}
