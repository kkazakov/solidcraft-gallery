-- External sources are fetched through their API, not cloned into a local bare
-- repository. The lean design bytes live in content-addressed artifact storage
-- so the worker and downloads do not need provider credentials.

alter table versions add column if not exists design_key text;

comment on column versions.design_key is 'Artifact storage key for the lean design (external sources).';
