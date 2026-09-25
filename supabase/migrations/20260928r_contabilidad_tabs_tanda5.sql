-- =====================================================================
-- 20260928r — Contabilidad: tabs `tesoreria` y `bienes` (2026-09-24)
--
-- Quien ya ve Plan ve también Tesorería (movimientos de fondos, 20260928l/m)
-- y Bienes de uso (20260928p/q). Toca SOLO `permisos.contabilidad.tabs`
-- (mismo molde que 20260928k): no flags —`movimientos_fondos` y
-- `bienes_uso` nacen en false y se asignan a mano—, ni personalizado, ni
-- modulos (las tabs no mueven modulos_de_permisos). Idempotente. Los perfiles
-- con tabs vacías o sin tabs ya ven todas. Mismo criterio sobre `roles`.
-- =====================================================================

update public.profiles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["tesoreria"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'plan'
   and not ((permisos #> '{contabilidad,tabs}') ? 'tesoreria');

update public.profiles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["bienes"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'plan'
   and not ((permisos #> '{contabilidad,tabs}') ? 'bienes');

update public.roles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["tesoreria"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'plan'
   and not ((permisos #> '{contabilidad,tabs}') ? 'tesoreria');

update public.roles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["bienes"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'plan'
   and not ((permisos #> '{contabilidad,tabs}') ? 'bienes');

notify pgrst, 'reload schema';
