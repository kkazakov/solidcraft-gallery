import { getDatabase, listSitemapProjects } from '@gallery/db';

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET() {
  const origin = (process.env.PUBLIC_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '');
  let entries: { ownerUsername: string; slug: string; publishedAt: Date | null }[];
  try {
    entries = await listSitemapProjects(getDatabase());
  } catch {
    entries = [];
  }

  const urls = entries
    .map((entry) => {
      const loc = `${origin}/${xml(entry.ownerUsername)}/${xml(entry.slug)}`;
      const lastmod = entry.publishedAt ? `<lastmod>${entry.publishedAt.toISOString()}</lastmod>` : '';
      return `<url><loc>${loc}</loc>${lastmod}</url>`;
    })
    .join('');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
