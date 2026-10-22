import type { Database } from './client.js';

export type SearchSort = 'relevance' | 'newest' | 'popular';

export interface SearchOptions {
  q?: string;
  tag?: string;
  license?: string;
  sort?: SearchSort;
  featuredOnly?: boolean;
  ownerId?: string;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  id: string;
  slug: string;
  ownerUsername: string;
  title: string;
  description: string;
  license: string | null;
  tags: string[];
  publishedAt: Date | null;
  coverKey: string | null;
  downloads: number;
  rank: number;
}

export interface SearchResult {
  items: SearchHit[];
  total: number;
  fallback: boolean;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface LicenseCount {
  license: string;
  count: number;
}

function clampLimit(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 24;
  return Math.min(Math.max(Math.trunc(value), 1), 60);
}

function clampOffset(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), 10_000);
}

/**
 * Public gallery search. `public_projects` already enforces visibility and
 * readiness, so no query here can leak a private project. Relevance uses both
 * text-search configurations (see docs/09-search.md): `simple` keeps part
 * numbers exact, `english` stems prose.
 */
export async function searchPublicProjects(db: Database, options: SearchOptions = {}): Promise<SearchResult> {
  const q = options.q?.trim() || null;
  const tag = options.tag?.trim() || null;
  const license = options.license?.trim() || null;
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const featuredOnly = options.featuredOnly === true;
  const ownerId = options.ownerId?.trim() || null;
  const sort: SearchSort = options.sort ?? (q ? 'relevance' : 'newest');

  const order =
    sort === 'popular'
      ? db`p.downloads desc, p.published_at desc nulls last, p.id desc`
      : sort === 'relevance' && q
        ? db`rank desc, p.published_at desc nulls last, p.id desc`
        : db`p.published_at desc nulls last, p.id desc`;

  const items = await db<SearchHit[]>`
    select
      p.id,
      p.slug::text as slug,
      u.username::text as "ownerUsername",
      p.title,
      p.description,
      p.license,
      p.tags,
      p.published_at as "publishedAt",
      (
        select a.storage_key
        from artifacts a
        join versions v on v.id = a.version_id
        where v.project_id = p.id and v.status = 'ready' and a.kind = 'iso'
        order by v.authored_at desc
        limit 1
      ) as "coverKey",
      p.downloads,
      case
        when ${q}::text is null then 0
        else greatest(
          ts_rank_cd(p.search_vector, websearch_to_tsquery('simple', ${q ?? ''}), 32),
          ts_rank_cd(p.search_vector, websearch_to_tsquery('english', ${q ?? ''}), 32)
        )
      end as rank
    from public_projects p
    join users u on u.id = p.owner_id
    where (${q}::text is null
           or p.search_vector @@ websearch_to_tsquery('simple', ${q ?? ''})
           or p.search_vector @@ websearch_to_tsquery('english', ${q ?? ''}))
      and (${tag}::text is null or ${tag ?? ''} = any (p.tags))
      and (${license}::text is null or p.license = ${license ?? ''})
      and (${featuredOnly} = false or p.featured = true)
      and (${ownerId}::text is null or p.owner_id::text = ${ownerId})
    order by ${order}
    limit ${limit} offset ${offset}
  `;

  const counted = await db<{ count: number }[]>`
    select count(*)::int as count
    from public_projects p
    where (${q}::text is null
           or p.search_vector @@ websearch_to_tsquery('simple', ${q ?? ''})
           or p.search_vector @@ websearch_to_tsquery('english', ${q ?? ''}))
      and (${tag}::text is null or ${tag ?? ''} = any (p.tags))
      and (${license}::text is null or p.license = ${license ?? ''})
      and (${featuredOnly} = false or p.featured = true)
      and (${ownerId}::text is null or p.owner_id::text = ${ownerId})
  `;

  let total = counted[0]?.count ?? 0;
  if (items.length > 0 || !q) return { items, total, fallback: false };

  // Typo tolerance: fall back to trigram similarity when FTS finds nothing.
  const fallbackItems = await db<SearchHit[]>`
    select
      p.id,
      p.slug::text as slug,
      u.username::text as "ownerUsername",
      p.title,
      p.description,
      p.license,
      p.tags,
      p.published_at as "publishedAt",
      (
        select a.storage_key
        from artifacts a
        join versions v on v.id = a.version_id
        where v.project_id = p.id and v.status = 'ready' and a.kind = 'iso'
        order by v.authored_at desc
        limit 1
      ) as "coverKey",
      p.downloads,
      similarity(p.title, ${q}) as rank
    from public_projects p
    join users u on u.id = p.owner_id
    where (p.title % ${q} or similarity(p.title, ${q}) > 0.2 or p.title ilike '%' || ${q} || '%')
      and (${tag}::text is null or ${tag ?? ''} = any (p.tags))
      and (${license}::text is null or p.license = ${license ?? ''})
      and (${featuredOnly} = false or p.featured = true)
      and (${ownerId}::text is null or p.owner_id::text = ${ownerId})
    order by rank desc, p.published_at desc nulls last, p.id desc
    limit ${limit} offset ${offset}
  `;
  total = fallbackItems.length;

  return { items: fallbackItems, total, fallback: true };
}

export async function listPopularTags(db: Database, limit = 24): Promise<TagCount[]> {
  return db<TagCount[]>`
    select tag, count(*)::int as count
    from public_projects, unnest(tags) as tag
    group by tag
    order by count desc, tag asc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `;
}

export async function listLicenses(db: Database): Promise<LicenseCount[]> {
  return db<LicenseCount[]>`
    select license, count(*)::int as count
    from public_projects
    where license is not null
    group by license
    order by count desc, license asc
  `;
}

export async function countPublicProjects(db: Database): Promise<number> {
  const rows = await db<{ count: number }[]>`select count(*)::int as count from public_projects`;
  return rows[0]?.count ?? 0;
}

export async function listRecentProjects(db: Database, limit = 12): Promise<SearchHit[]> {
  return (await searchPublicProjects(db, { sort: 'newest', limit })).items;
}

export async function listFeaturedProjects(db: Database, limit = 3): Promise<SearchHit[]> {
  return (await searchPublicProjects(db, { featuredOnly: true, limit })).items;
}

export interface SitemapEntry {
  ownerUsername: string;
  slug: string;
  publishedAt: Date | null;
}

export async function listSitemapProjects(db: Database, limit = 50_000): Promise<SitemapEntry[]> {
  return db<SitemapEntry[]>`
    select u.username::text as "ownerUsername", p.slug::text as slug, p.published_at as "publishedAt"
    from public_projects p
    join users u on u.id = p.owner_id
    order by p.published_at desc nulls last
    limit ${Math.min(Math.max(limit, 1), 50_000)}
  `;
}

export async function listPublicProjectsByOwner(db: Database, ownerId: string, limit = 48): Promise<SearchHit[]> {
  return (await searchPublicProjects(db, { ownerId, sort: 'newest', limit })).items;
}
