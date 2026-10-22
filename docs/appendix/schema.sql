-- SolidCraft Gallery — initial schema (PostgreSQL 16)
--
-- Apply as the first migration. Extensions require a role with CREATE EXTENSION
-- (usually a superuser); create them once during provisioning if the app role
-- cannot.
--
-- Conventions:
--   * timestamps are timestamptz, UTC
--   * ids are UUID v4 from gen_random_uuid()
--   * citext for case-insensitive usernames and slugs
--   * no row-level security in v1; the app is the only writer and uses one role

begin;

create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type user_role as enum ('user', 'admin');

create type identity_provider as enum ('forgejo', 'github', 'gitlab', 'gitea');

create type repo_provider as enum ('forgejo', 'github', 'gitlab', 'gitea', 'codeberg');

create type repo_status as enum ('active', 'error', 'disabled');

create type project_visibility as enum ('public', 'unlisted', 'private');

create type project_status as enum ('pending', 'indexing', 'ready', 'error', 'quarantined');

create type version_status as enum ('pending', 'fetching', 'rendering', 'indexing', 'ready', 'failed');

create type artifact_kind as enum ('thumb', 'iso', 'top', 'front', 'og', 'step', 'stl', 'cover');

create type job_status as enum ('queued', 'running', 'done', 'failed', 'dead');

create type report_reason as enum ('copyright', 'unsafe', 'spam', 'malformed', 'other');

create type report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

-- ---------------------------------------------------------------- users

create table users (
  id            uuid primary key default gen_random_uuid(),
  username      citext not null unique,
  email         citext unique,
  display_name  text not null default '',
  avatar_url    text,
  role          user_role not null default 'user',
  suspended_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_seen_at  timestamptz,
  constraint users_username_format
    check (username::text ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  constraint users_display_name_len
    check (char_length(display_name) <= 80)
);

comment on table users is 'Site accounts; identities link to Forgejo/GitHub.';

create table identities (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references users(id) on delete cascade,
  provider          identity_provider not null,
  subject           text not null,
  username          text,
  access_token_enc  bytea,
  refresh_token_enc bytea,
  scopes            text[] not null default '{}',
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (provider, subject)
);

create index identities_user_idx on identities (user_id);

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    bytea not null unique,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  ip            inet,
  user_agent    text
);

create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

create table api_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  name          text not null,
  prefix        text not null,
  token_hash    bytea not null unique,
  scopes        text[] not null default '{read}',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  expires_at    timestamptz,
  revoked_at    timestamptz,
  constraint api_tokens_name_len check (char_length(name) between 1 and 60)
);

create index api_tokens_user_idx on api_tokens (user_id);

create table invites (
  id          uuid primary key default gen_random_uuid(),
  code_hash   bytea not null unique,
  created_by  uuid not null references users(id) on delete cascade,
  note        text not null default '',
  max_uses    integer not null default 1 check (max_uses > 0),
  uses        integer not null default 0 check (uses >= 0),
  expires_at  timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- repos

create table repos (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references users(id) on delete cascade,
  provider            repo_provider not null,
  external_id         text not null,
  url                 text not null,
  default_branch      text not null default 'main',
  is_private          boolean not null default true,
  token_enc           bytea,
  webhook_secret_enc  bytea,
  last_commit_sha     text,
  last_synced_at      timestamptz,
  status              repo_status not null default 'active',
  error               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (provider, external_id),
  unique (owner_id, url),
  constraint repos_url_https check (url ~ '^https://'),
  constraint repos_commit_sha check (
    last_commit_sha is null or last_commit_sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'
  )
);

create index repos_owner_idx on repos (owner_id, updated_at desc);

comment on column repos.token_enc is 'AES-256-GCM; key id is prefixed to the ciphertext.';
comment on column repos.is_private is 'Mirrors the provider; the site may be stricter, never looser.';
-- versions.design_key points into content-addressed storage for external sources.

-- ---------------------------------------------------------------- projects

create table projects (
  id            uuid primary key default gen_random_uuid(),
  repo_id       uuid not null unique references repos(id) on delete cascade,
  owner_id      uuid not null references users(id) on delete cascade,
  slug          citext not null,
  title         text not null,
  description   text not null default '',
  readme        text not null default '',
  readme_html   text not null default '',
  keywords      text not null default '',
  license       text,
  design_path   text not null,
  cover_key     text,
  visibility    project_visibility not null default 'private',
  status        project_status not null default 'pending',
  tags          text[] not null default '{}',
  featured      boolean not null default false,
  downloads     bigint not null default 0 check (downloads >= 0),
  search_vector tsvector,
  published_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  unique (owner_id, slug),
  constraint projects_slug_format
    check (slug::text ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$'),
  constraint projects_title_len check (char_length(title) between 1 and 120),
  constraint projects_description_len check (char_length(description) <= 2000),
  constraint projects_tags_len check (cardinality(tags) <= 10),
  constraint projects_design_path check (design_path !~ '(^|/)\.\.(/|$)'),
  constraint projects_public_license check (visibility <> 'public' or license is not null)
);

create index projects_browse_idx
  on projects (visibility, status, published_at desc nulls last, id desc)
  where deleted_at is null;

create index projects_owner_idx
  on projects (owner_id, updated_at desc)
  where deleted_at is null;

create index projects_featured_idx
  on projects (featured, published_at desc nulls last)
  where visibility = 'public' and status = 'ready' and deleted_at is null;

create index projects_tags_idx on projects using gin (tags);
create index projects_search_idx on projects using gin (search_vector);
create index projects_title_trgm_idx on projects using gin (title gin_trgm_ops);
create index projects_license_idx
  on projects (license)
  where visibility = 'public' and status = 'ready' and deleted_at is null;

-- ---------------------------------------------------------------- versions

create table versions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  commit_sha    text not null,
  tag           text,
  is_release    boolean generated always as (tag is not null) stored,
  message       text not null default '',
  author_name   text not null default '',
  authored_at   timestamptz not null,
  design_path   text not null,
  design_key    text,
  design_sha256 bytea not null,
  design_bytes  bigint not null check (design_bytes > 0),
  lean          boolean not null default false,
  status        version_status not null default 'pending',
  error_code    text,
  error_detail  text,
  metrics       jsonb not null default '{}'::jsonb,
  warnings      jsonb not null default '[]'::jsonb,
  indexed_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (project_id, commit_sha),
  constraint versions_commit_sha check (commit_sha ~ '^[0-9a-f]{40}([0-9a-f]{24})?$'),
  constraint versions_tag_len check (tag is null or char_length(tag) between 1 and 64),
  constraint versions_design_path check (design_path !~ '(^|/)\.\.(/|$)')
);

create unique index versions_tag_idx
  on versions (project_id, tag)
  where tag is not null;

create index versions_project_idx on versions (project_id, authored_at desc);
create index versions_status_idx on versions (status);
create index versions_release_idx on versions (project_id, is_release, authored_at desc);

-- ---------------------------------------------------------------- artifacts

create table artifacts (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references versions(id) on delete cascade,
  kind         artifact_kind not null,
  storage_key  text not null,
  sha256       bytea not null,
  bytes        bigint not null check (bytes > 0),
  width        integer,
  height       integer,
  created_at   timestamptz not null default now(),
  unique (version_id, kind)
);

create index artifacts_sha_idx on artifacts (sha256);
create index artifacts_key_idx on artifacts (storage_key);

-- ---------------------------------------------------------------- social

create table favorites (
  user_id     uuid not null references users(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, project_id)
);

create index favorites_project_idx on favorites (project_id);

create table reports (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  reporter_id     uuid references users(id) on delete set null,
  reason          report_reason not null,
  details         text not null default '',
  status          report_status not null default 'open',
  resolution_note text,
  resolved_by     uuid references users(id) on delete set null,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  constraint reports_details_len check (char_length(details) <= 2000)
);

create index reports_open_idx
  on reports (status, created_at)
  where status in ('open', 'reviewing');

create index reports_project_idx on reports (project_id, created_at desc);

-- ---------------------------------------------------------------- jobs

create table jobs (
  id            bigserial primary key,
  kind          text not null,
  payload       jsonb not null default '{}'::jsonb,
  status        job_status not null default 'queued',
  priority      integer not null default 100,
  run_at        timestamptz not null default now(),
  attempts      integer not null default 0 check (attempts >= 0),
  max_attempts  integer not null default 3 check (max_attempts > 0),
  locked_by     text,
  locked_at     timestamptz,
  last_error    text,
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index jobs_claim_idx
  on jobs (status, run_at, priority)
  where status = 'queued';

create index jobs_kind_idx on jobs (kind, status);

-- One in-flight sync per repository.
create unique index jobs_repo_sync_unique
  on jobs (kind, (payload ->> 'repoId'))
  where status in ('queued', 'running') and kind = 'repo.sync';

-- ---------------------------------------------------------------- audit

create table audit_log (
  id            bigserial primary key,
  actor_id      uuid references users(id) on delete set null,
  action        text not null,
  subject_type  text,
  subject_id    text,
  meta          jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index audit_actor_idx on audit_log (actor_id, created_at desc);
create index audit_subject_idx on audit_log (subject_type, subject_id, created_at desc);
create index audit_created_idx on audit_log (created_at desc);

-- ---------------------------------------------------------------- triggers

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger users_touch before update on users
  for each row execute function touch_updated_at();

create trigger identities_touch before update on identities
  for each row execute function touch_updated_at();

create trigger repos_touch before update on repos
  for each row execute function touch_updated_at();

create trigger projects_touch before update on projects
  for each row execute function touch_updated_at();

create or replace function projects_search_vector_update() returns trigger
language plpgsql as $$
declare
  -- Exact tokens: titles, tags, parameter/feature names. No stemming, so part
  -- numbers such as "M3" and "PETG" stay searchable.
  exact_tokens text := concat_ws(' ', new.title, array_to_string(new.tags, ' '), new.keywords);
  -- Prose: description and README. English stemming so "enclosures" finds "enclosure".
  prose text := concat_ws(' ', new.title, new.description, new.readme);
begin
  new.search_vector :=
      setweight(to_tsvector('simple', exact_tokens), 'A')
   || setweight(to_tsvector('english', prose), 'B');
  return new;
end
$$;

create trigger projects_search_vector_trg
  before insert or update of title, tags, description, readme, keywords on projects
  for each row execute function projects_search_vector_update();

-- ---------------------------------------------------------------- views

-- Every public listing queries this view, never the table, so the visibility
-- predicate cannot be forgotten. Recreate it when adding columns.
create view public_projects
  with (security_invoker = true) as
select *
from projects
where visibility = 'public'
  and status = 'ready'
  and deleted_at is null;

comment on view public_projects is 'Public, ready, not deleted. The only source for listings.';

-- ---------------------------------------------------------------- seed check

-- The application bootstraps the first admin from ADMIN_USERNAMES on first login.
-- No default users, passwords or tokens are inserted here.

commit;
