import { getDatabase, listLicenses, listPopularTags, searchPublicProjects, type SearchSort } from '@gallery/db';

const SORTS = new Set<SearchSort>(['relevance', 'newest', 'popular']);
const PAGE_SIZE = 24;

export async function load({ url }: { url: URL }) {
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
  const tag = (url.searchParams.get('tag') ?? '').trim().slice(0, 32);
  const license = (url.searchParams.get('license') ?? '').trim().slice(0, 64);
  const requestedSort = url.searchParams.get('sort') ?? '';
  const sort: SearchSort = SORTS.has(requestedSort as SearchSort)
    ? (requestedSort as SearchSort)
    : q
      ? 'relevance'
      : 'newest';
  const page = Math.min(Math.max(Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1, 1), 100);

  try {
    const db = getDatabase();
    const [result, tags, licenses] = await Promise.all([
      searchPublicProjects(db, {
        q: q || undefined,
        tag: tag || undefined,
        license: license || undefined,
        sort,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
      listPopularTags(db, 24),
      listLicenses(db),
    ]);

    return {
      q,
      tag,
      license,
      sort,
      page,
      limit: PAGE_SIZE,
      result,
      tags,
      licenses,
      pages: Math.max(1, Math.ceil(result.total / PAGE_SIZE)),
      dbDown: false,
    };
  } catch {
    return {
      q,
      tag,
      license,
      sort,
      page,
      limit: PAGE_SIZE,
      result: { items: [], total: 0, fallback: false },
      tags: [],
      licenses: [],
      pages: 1,
      dbDown: true,
    };
  }
}
