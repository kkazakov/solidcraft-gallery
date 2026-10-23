-- Existing projects predate active_version_id. Point them at the version the
-- public page already picks: tagged first, then newest ready.
update projects p
set active_version_id = v.id
from (
  select distinct on (project_id) id, project_id
  from versions
  where status = 'ready'
  order by project_id, (tag is not null) desc, authored_at desc
) v
where v.project_id = p.id
  and p.active_version_id is null;
