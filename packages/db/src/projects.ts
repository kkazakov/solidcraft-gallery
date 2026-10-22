import type { Database } from './client.js';

export type ProjectVisibility = 'public' | 'unlisted' | 'private';
export type ProjectStatus = 'pending' | 'indexing' | 'ready' | 'error' | 'quarantined';
export type VersionStatus = 'pending' | 'fetching' | 'rendering' | 'indexing' | 'ready' | 'failed';

export interface Project {
  id: string;
  ownerId: string;
  ownerUsername: string;
  repoId: string;
  repoProvider: string;
  repoUrl: string;
  repoPrivate: boolean;
  localPath: string | null;
  slug: string;
  title: string;
  description: string;
  license: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  designPath: string;
  tags: string[];
  publishedAt: Date | null;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  repoProvider: string;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  updatedAt: Date;
}

export interface Version {
  id: string;
  projectId: string;
  commitSha: string;
  tag: string | null;
  message: string;
  authorName: string;
  authoredAt: Date;
  designPath: string;
  designKey: string | null;
  designSha256: Uint8Array;
  designBytes: number;
  lean: boolean;
  status: VersionStatus;
  errorCode: string | null;
  errorDetail: string | null;
  metrics: Record<string, unknown>;
  warnings: unknown[];
}

export interface Artifact {
  id: string;
  versionId: string;
  kind: string;
  storageKey: string;
  sha256: Uint8Array;
  bytes: number;
  width: number | null;
  height: number | null;
}

export interface CreateLocalProjectInput {
  ownerId: string;
  ownerUsername: string;
  slug: string;
  title: string;
  description?: string;
  license?: string | null;
  tags?: string[];
  repoUrl: string;
  localPath: string;
}

export async function createLocalProject(db: Database, input: CreateLocalProjectInput): Promise<string> {
  return db.begin(async (tx) => {
    const repos = await tx<{ id: string }[]>`
      insert into repos (owner_id, provider, external_id, url, default_branch, is_private, local_path)
      values (
        ${input.ownerId},
        'local',
        ${`local:${input.ownerUsername}/${input.slug}`},
        ${input.repoUrl},
        'main',
        true,
        ${input.localPath}
      )
      returning id
    `;

    const projects = await tx<{ id: string }[]>`
      insert into projects (
        repo_id, owner_id, slug, title, description, license, design_path, visibility, status, tags
      )
      values (
        ${repos[0]!.id},
        ${input.ownerId},
        ${input.slug},
        ${input.title},
        ${input.description ?? ''},
        ${input.license ?? null},
        ${`designs/${input.slug}.solidcraft`},
        'private',
        'pending',
        ${tx.array(input.tags ?? [])}
      )
      returning id
    `;

    return projects[0]!.id;
  });
}

export async function findProjectByOwnerSlug(db: Database, owner: string, slug: string): Promise<Project | null> {
  const rows = await db<Project[]>`
    select
      p.id,
      p.owner_id as "ownerId",
      u.username::text as "ownerUsername",
      p.repo_id as "repoId",
      r.provider::text as "repoProvider",
      r.url as "repoUrl",
      r.is_private as "repoPrivate",
      r.local_path as "localPath",
      p.slug::text as slug,
      p.title,
      p.description,
      p.license,
      p.visibility::text as visibility,
      p.status::text as status,
      p.design_path as "designPath",
      p.tags,
      p.published_at as "publishedAt"
    from projects p
    join repos r on r.id = p.repo_id
    join users u on u.id = p.owner_id
    where u.username = ${owner}
      and p.slug = ${slug}
      and p.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

export async function findProjectById(db: Database, id: string): Promise<Project | null> {
  const rows = await db<Project[]>`
    select
      p.id, p.owner_id as "ownerId", u.username::text as "ownerUsername",
      p.repo_id as "repoId", r.provider::text as "repoProvider", r.url as "repoUrl",
      r.is_private as "repoPrivate", r.local_path as "localPath",
      p.slug::text as slug, p.title, p.description, p.license,
      p.visibility::text as visibility, p.status::text as status,
      p.design_path as "designPath", p.tags, p.published_at as "publishedAt"
    from projects p
    join repos r on r.id = p.repo_id
    join users u on u.id = p.owner_id
    where p.id = ${id} and p.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listProjectsForOwner(db: Database, ownerId: string): Promise<ProjectSummary[]> {
  return db<ProjectSummary[]>`
    select p.id, p.slug::text as slug, p.title, r.provider::text as "repoProvider",
           p.visibility::text as visibility, p.status::text as status, p.updated_at as "updatedAt"
    from projects p
    join repos r on r.id = p.repo_id
    where p.owner_id = ${ownerId} and p.deleted_at is null
    order by p.updated_at desc
    limit 100
  `;
}

export async function countProjectsForOwner(db: Database, ownerId: string): Promise<number> {
  const rows = await db<{ count: string }[]>`
    select count(*)::text as count from projects where owner_id = ${ownerId} and deleted_at is null
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function setProjectStatus(db: Database, id: string, status: ProjectStatus): Promise<void> {
  await db`update projects set status = ${status}, updated_at = now() where id = ${id}`;
}

export async function setProjectReady(db: Database, id: string): Promise<void> {
  await db`
    update projects
    set status = 'ready', published_at = coalesce(published_at, now()), updated_at = now()
    where id = ${id}
  `;
}

export async function insertVersion(
  db: Database,
  input: {
    projectId: string;
    commitSha: string;
    tag?: string | null;
    message: string;
    authorName: string;
    authoredAt: Date;
    designPath: string;
    designKey?: string | null;
    designSha256: Uint8Array;
    designBytes: number;
    lean: boolean;
  },
): Promise<string> {
  const rows = await db<{ id: string }[]>`
    insert into versions (
      project_id, commit_sha, tag, message, author_name, authored_at,
      design_path, design_key, design_sha256, design_bytes, lean, status
    )
    values (
      ${input.projectId}, ${input.commitSha}, ${input.tag ?? null}, ${input.message},
      ${input.authorName}, ${input.authoredAt}, ${input.designPath}, ${input.designKey ?? null}, ${input.designSha256},
      ${input.designBytes}, ${input.lean}, 'pending'
    )
    on conflict (project_id, commit_sha) do nothing
    returning id
  `;
  if (rows[0]) return rows[0].id;

  const existing = await db<{ id: string }[]>`
    select id from versions where project_id = ${input.projectId} and commit_sha = ${input.commitSha}
  `;
  return existing[0]!.id;
}

export async function findVersionById(db: Database, id: string): Promise<Version | null> {
  const rows = await db<Version[]>`
    select
      id, project_id as "projectId", commit_sha as "commitSha", tag, message,
      author_name as "authorName", authored_at as "authoredAt",
      design_path as "designPath", design_key as "designKey", design_sha256 as "designSha256",
      design_bytes as "designBytes", lean, status::text as status,
      error_code as "errorCode", error_detail as "errorDetail", metrics, warnings
    from versions where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function latestReadyVersion(db: Database, projectId: string): Promise<Version | null> {
  const rows = await db<Version[]>`
    select
      id, project_id as "projectId", commit_sha as "commitSha", tag, message,
      author_name as "authorName", authored_at as "authoredAt",
      design_path as "designPath", design_key as "designKey", design_sha256 as "designSha256",
      design_bytes as "designBytes", lean, status::text as status,
      error_code as "errorCode", error_detail as "errorDetail", metrics, warnings
    from versions
    where project_id = ${projectId} and status = 'ready'
    order by (tag is not null) desc, authored_at desc
    limit 1
  `;
  return rows[0] ?? null;
}

export async function markVersionRendering(db: Database, id: string): Promise<void> {
  await db`update versions set status = 'rendering' where id = ${id}`;
}

export async function markVersionReady(
  db: Database,
  id: string,
  metrics: Record<string, unknown>,
  warnings: unknown[],
): Promise<void> {
  await db`
    update versions
    set status = 'ready', metrics = ${db.json(metrics as never)}, warnings = ${db.json(warnings as never)},
        indexed_at = now(), error_code = null, error_detail = null
    where id = ${id}
  `;
}

export async function markVersionFailed(
  db: Database,
  id: string,
  errorCode: string,
  errorDetail: string,
): Promise<void> {
  await db`
    update versions
    set status = 'failed', error_code = ${errorCode}, error_detail = ${errorDetail.slice(0, 2000)}
    where id = ${id}
  `;
}

export async function upsertArtifact(
  db: Database,
  input: {
    versionId: string;
    kind: string;
    storageKey: string;
    sha256: Uint8Array;
    bytes: number;
    width?: number | null;
    height?: number | null;
  },
): Promise<void> {
  await db`
    insert into artifacts (version_id, kind, storage_key, sha256, bytes, width, height)
    values (${input.versionId}, ${input.kind}, ${input.storageKey}, ${input.sha256},
            ${input.bytes}, ${input.width ?? null}, ${input.height ?? null})
    on conflict (version_id, kind) do update
      set storage_key = excluded.storage_key, sha256 = excluded.sha256, bytes = excluded.bytes,
          width = excluded.width, height = excluded.height
  `;
}

export async function listArtifacts(db: Database, versionId: string): Promise<Artifact[]> {
  return db<Artifact[]>`
    select id, version_id as "versionId", kind, storage_key as "storageKey",
           sha256, bytes, width, height
    from artifacts where version_id = ${versionId}
  `;
}

export interface ArtifactLookup {
  storageKey: string;
  kind: string;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  ownerId: string;
  projectId: string;
}

export async function findArtifactByStorageKey(db: Database, key: string): Promise<ArtifactLookup | null> {
  const rows = await db<ArtifactLookup[]>`
    select
      a.storage_key as "storageKey",
      a.kind,
      p.visibility::text as visibility,
      p.status::text as status,
      p.owner_id as "ownerId",
      p.id as "projectId"
    from artifacts a
    join versions v on v.id = a.version_id
    join projects p on p.id = v.project_id
    where a.storage_key = ${key} and p.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

export async function listVersions(db: Database, projectId: string, limit = 50): Promise<Version[]> {
  return db<Version[]>`
    select
      id, project_id as "projectId", commit_sha as "commitSha", tag, message,
      author_name as "authorName", authored_at as "authoredAt",
      design_path as "designPath", design_key as "designKey", design_sha256 as "designSha256",
      design_bytes as "designBytes", lean, status::text as status,
      error_code as "errorCode", error_detail as "errorDetail", metrics, warnings
    from versions
    where project_id = ${projectId}
    order by (tag is not null) desc, authored_at desc
    limit ${limit}
  `;
}

export async function listProjectSlugs(db: Database, ownerId: string): Promise<string[]> {
  const rows = await db<{ slug: string }[]>`
    select slug::text as slug from projects where owner_id = ${ownerId} and deleted_at is null
  `;
  return rows.map((row) => row.slug);
}

export async function setProjectVisibility(
  db: Database,
  id: string,
  visibility: ProjectVisibility,
  license: string | null,
): Promise<void> {
  await db`
    update projects
    set visibility = ${visibility}, license = ${license}, updated_at = now()
    where id = ${id}
  `;
}

export interface Repo {
  id: string;
  ownerId: string;
  provider: string;
  externalId: string;
  url: string;
  defaultBranch: string;
  isPrivate: boolean;
  localPath: string | null;
  lastCommitSha: string | null;
  lastSyncedAt: Date | null;
  status: string;
  error: string | null;
}

export interface CreateExternalProjectInput {
  ownerId: string;
  ownerUsername: string;
  provider: 'forgejo' | 'github' | 'gitlab' | 'gitea' | 'codeberg';
  externalId: string;
  url: string;
  defaultBranch: string;
  commitSha: string | null;
  isPrivate?: boolean;
  slug: string;
  title: string;
  description?: string;
  license?: string | null;
  tags?: string[];
  designPath: string;
}

export async function createExternalProject(
  db: Database,
  input: CreateExternalProjectInput,
): Promise<{ projectId: string; repoId: string }> {
  return db.begin(async (tx) => {
    const repos = await tx<{ id: string }[]>`
      insert into repos (
        owner_id, provider, external_id, url, default_branch, is_private,
        last_commit_sha, last_synced_at
      )
      values (
        ${input.ownerId}, ${input.provider}, ${input.externalId}, ${input.url},
        ${input.defaultBranch}, ${input.isPrivate ?? false}, ${input.commitSha}, now()
      )
      returning id
    `;

    const projects = await tx<{ id: string }[]>`
      insert into projects (
        repo_id, owner_id, slug, title, description, license, design_path,
        visibility, status, tags
      )
      values (
        ${repos[0]!.id}, ${input.ownerId}, ${input.slug}, ${input.title},
        ${input.description ?? ''}, ${input.license ?? null}, ${input.designPath},
        'private', 'pending', ${tx.array(input.tags ?? [])}
      )
      returning id
    `;

    return { projectId: projects[0]!.id, repoId: repos[0]!.id };
  });
}

export async function findRepoById(db: Database, id: string): Promise<Repo | null> {
  const rows = await db<Repo[]>`
    select
      id, owner_id as "ownerId", provider::text as provider, external_id as "externalId",
      url, default_branch as "defaultBranch", is_private as "isPrivate",
      local_path as "localPath", last_commit_sha as "lastCommitSha",
      last_synced_at as "lastSyncedAt", status::text as status, error
    from repos where id = ${id}
  `;
  return rows[0] ?? null;
}

export async function updateRepoHead(db: Database, id: string, commitSha: string): Promise<void> {
  await db`
    update repos
    set last_commit_sha = ${commitSha}, last_synced_at = now(), status = 'active', error = null
    where id = ${id}
  `;
}

export async function setRepoError(db: Database, id: string, message: string): Promise<void> {
  await db`
    update repos set status = 'error', error = ${message.slice(0, 1000)}, last_synced_at = now()
    where id = ${id}
  `;
}

export async function findRepoByExternalId(db: Database, provider: string, externalId: string): Promise<Repo | null> {
  const rows = await db<Repo[]>`
    select
      id, owner_id as "ownerId", provider::text as provider, external_id as "externalId",
      url, default_branch as "defaultBranch", is_private as "isPrivate",
      local_path as "localPath", last_commit_sha as "lastCommitSha",
      last_synced_at as "lastSyncedAt", status::text as status, error
    from repos
    where provider = ${provider} and external_id = ${externalId}
    limit 1
  `;
  return rows[0] ?? null;
}

export async function findProjectByRepoId(db: Database, repoId: string): Promise<Project | null> {
  const rows = await db<Project[]>`
    select
      p.id, p.owner_id as "ownerId", u.username::text as "ownerUsername",
      p.repo_id as "repoId", r.provider::text as "repoProvider", r.url as "repoUrl",
      r.is_private as "repoPrivate", r.local_path as "localPath",
      p.slug::text as slug, p.title, p.description, p.license,
      p.visibility::text as visibility, p.status::text as status,
      p.design_path as "designPath", p.tags, p.published_at as "publishedAt"
    from projects p
    join repos r on r.id = p.repo_id
    join users u on u.id = p.owner_id
    where p.repo_id = ${repoId} and p.deleted_at is null
    limit 1
  `;
  return rows[0] ?? null;
}

export async function setRepoPrivate(db: Database, id: string, isPrivate: boolean): Promise<void> {
  await db`update repos set is_private = ${isPrivate}, updated_at = now() where id = ${id}`;
}

export async function setProjectVisibilityAndRepo(
  db: Database,
  input: {
    projectId: string;
    visibility: ProjectVisibility;
    license: string | null;
    repoId?: string;
    repoPrivate?: boolean;
  },
): Promise<void> {
  await db.begin(async (tx) => {
    if (input.repoId !== undefined && input.repoPrivate !== undefined) {
      await tx`
        update repos set is_private = ${input.repoPrivate}, updated_at = now()
        where id = ${input.repoId}
      `;
    }
    const rows = await tx<{ id: string }[]>`
      update projects
      set visibility = ${input.visibility}, license = ${input.license}, updated_at = now()
      where id = ${input.projectId}
      returning id
    `;
    if (!rows[0]) throw new Error('project not found while changing visibility');
  });
}
