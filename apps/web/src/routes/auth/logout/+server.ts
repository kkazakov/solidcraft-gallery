import { redirect } from '@sveltejs/kit';
import { assertSameOrigin, signOut } from '../../../lib/server/auth';

export async function POST(event) {
  assertSameOrigin(event);
  await signOut(event);
  throw redirect(303, '/');
}
