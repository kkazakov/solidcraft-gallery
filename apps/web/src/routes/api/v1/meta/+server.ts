import { json } from '@sveltejs/kit';

/** Public instance metadata. Counts arrive with the public gallery milestone. */
export function GET() {
  return json({
    name: 'SolidCraft Gallery',
    api_version: 'v1',
    status: 'scaffold',
    version: process.env.APP_VERSION ?? 'dev',
  });
}
