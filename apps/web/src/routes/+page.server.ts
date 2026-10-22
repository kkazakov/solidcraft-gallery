import {
  countPublicProjects,
  getDatabase,
  listFeaturedProjects,
  listPopularTags,
  listRecentProjects,
} from '@gallery/db';

export async function load() {
  const version = process.env.APP_VERSION ?? 'dev';
  try {
    const db = getDatabase();
    const [featured, recent, tags, total] = await Promise.all([
      listFeaturedProjects(db, 3),
      listRecentProjects(db, 12),
      listPopularTags(db, 16),
      countPublicProjects(db),
    ]);
    return { version, featured, recent, tags, total, dbDown: false };
  } catch {
    return { version, featured: [], recent: [], tags: [], total: 0, dbDown: true };
  }
}
