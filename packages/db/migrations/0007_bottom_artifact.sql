-- The project page shows the underside of a design. The renderer writes a
-- `bottom` snapshot next to `iso`, `top` and `front`; older versions simply
-- have no such artifact and the page falls back to the three they do have.
alter type artifact_kind add value if not exists 'bottom';
