-- A project can point at one ready version as the version shown and downloaded
-- from its public page. Null means "the newest ready version", which keeps
-- existing projects correct without a backfill.
alter table projects
  add column active_version_id uuid references versions(id) on delete set null;

comment on column projects.active_version_id is
  'Ready version shown on the project page; null falls back to the newest ready version.';

create index projects_active_version_idx on projects (active_version_id);
