export function GET() {
  const origin = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
  const body = `User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /admin
Disallow: /api/
Disallow: /auth/

Sitemap: ${origin}/sitemap.xml
`;
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
