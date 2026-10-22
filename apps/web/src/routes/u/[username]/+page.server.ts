import { error } from '@sveltejs/kit';
import { findUserByUsername, getDatabase, listPublicProjectsByOwner } from '@gallery/db';

export async function load({ params }) {
  const db = getDatabase();
  const user = await findUserByUsername(db, params.username);
  if (!user) throw error(404, 'Not found');
  const projects = await listPublicProjectsByOwner(db, user.id, 48);
  return { user, projects };
}
