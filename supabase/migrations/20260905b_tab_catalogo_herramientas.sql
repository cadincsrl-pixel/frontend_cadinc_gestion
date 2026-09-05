-- 20260905b — Tab "catalogo" de Herramientas para quien ya tiene tabs configurados
--
-- La pestaña Catálogo (tipos de herramienta y sinónimos) nace con la
-- migración 20260905a y el front. Los perfiles con `permisos.herramientas.tabs`
-- explícito no la verían: se les suma. Sosa (depósito) la recibe también,
-- según la decisión 1 del user (2026-09-05): puede sumar un tipo nuevo cuando
-- le llega algo que no existe. Los perfiles sin tabs (ven todo) y los admin no
-- necesitan nada.

update public.profiles
   set permisos = jsonb_set(
         permisos, '{herramientas,tabs}',
         (permisos->'herramientas'->'tabs') || '["catalogo"]'::jsonb)
 where permisos->'herramientas'->'tabs' is not null
   and jsonb_typeof(permisos->'herramientas'->'tabs') = 'array'
   and jsonb_array_length(permisos->'herramientas'->'tabs') > 0
   and not (permisos->'herramientas'->'tabs') ? 'catalogo';
