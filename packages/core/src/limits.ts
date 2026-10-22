/**
 * Hard limits shared by the API, the ingest worker and the CLI.
 * Changing a value here changes behaviour everywhere; the plan documents the
 * rationale in docs/03-repo-format.md and docs/06-pipeline.md.
 */
export const LIMITS = {
  /** Maximum size of one design file after upload/commit. */
  designBytes: 25 * 1024 * 1024,
  /** Soft repository size limit; the dashboard warns before this. */
  repoBytes: 1024 * 1024 * 1024,
  /** Maximum number of designs (primary + extras) indexed from one repository. */
  designsPerRepo: 10,
  /** Maximum archive entries in a .solidcraft container. */
  containerEntries: 10_000,
  /** Maximum project tags from project.json. */
  projectTags: 10,
  /** Maximum release tags indexed per project. */
  releaseTags: 20,
  /** Maximum projects per user during the beta. */
  projectsPerUser: 25,
  /** Wall-clock budget for one render job. */
  renderSeconds: 60,
  /** Maximum title length. */
  titleChars: 120,
  /** Maximum description length. */
  descriptionChars: 2_000,
} as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
