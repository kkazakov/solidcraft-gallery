import { getDatabase, listProjectsForOwner } from '@gallery/db';
import { requireViewer } from '../../lib/server/auth.js';

export async function load(event) {
  const viewer = await requireViewer(event);
  const projects = await listProjectsForOwner(getDatabase(), viewer.id);
  return { viewer, projects };
}
