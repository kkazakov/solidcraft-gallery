import { json } from '@sveltejs/kit';

export function GET() {
  return json({
    status: 'ok',
    version: process.env.APP_VERSION ?? 'dev',
    service: 'gallery-web',
  });
}
