-- Local development and the bundled Forgejo run over plain HTTP. Production
-- deployments must still use HTTPS; this constraint only permits the scheme so
-- a local Forgejo URL can be stored.
alter table repos drop constraint if exists repos_url_scheme;
alter table repos add constraint repos_url_scheme check (url ~ '^(https?|file)://');
