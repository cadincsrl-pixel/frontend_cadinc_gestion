-- Agrega el tab 'salidas' (Salidas a obra) a los perfiles que ya tienen la
-- lista de tabs de herramientas configurada explicitamente.
--
-- POR QUE HACE FALTA
-- `useTabsPermitidos` filtra por `profiles.permisos.herramientas.tabs`. Un tab
-- nuevo que no este en ese array es INVISIBLE para el usuario, aunque el codigo
-- este deployado y el endpoint responda. Es exactamente el bug de Aridos del
-- 2026-06-11: la pantalla existia y nadie la veia.
-- Los perfiles con `tabs` en null no se tocan: ya ven todo. Los admin tampoco.
--
-- De paso saca 'remitos', que quedo huerfano desde 20260520_drop_herr_remitos.sql:
-- ningun item de HERR_SUBNAV lo usa, asi que ocupa lugar sin renderizar nada.
--
-- Idempotente.

update profiles
   set permisos = jsonb_set(
         permisos,
         '{herramientas,tabs}',
         (
           select coalesce(jsonb_agg(t), '[]'::jsonb)
             from (
               select value as t
                 from jsonb_array_elements(permisos->'herramientas'->'tabs')
                where value <> '"remitos"'::jsonb
               union all
               select '"salidas"'::jsonb
             ) x
         )
       )
 where permisos->'herramientas' ? 'tabs'
   and jsonb_typeof(permisos->'herramientas'->'tabs') = 'array'
   and not (permisos->'herramientas'->'tabs' @> '["salidas"]'::jsonb);
