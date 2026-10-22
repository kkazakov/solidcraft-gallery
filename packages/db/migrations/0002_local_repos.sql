-- Local git backend for development and single-node installs.
-- Production can still use Forgejo; the provider enum carries both.

alter type repo_provider add value if not exists 'local';

alter table repos drop constraint if exists repos_url_https;
alter table repos add constraint repos_url_scheme check (url ~ '^(https|file)://');

alter table repos add column if not exists local_path text;

comment on column repos.local_path is 'Filesystem path when provider = local; never user-controlled.';
