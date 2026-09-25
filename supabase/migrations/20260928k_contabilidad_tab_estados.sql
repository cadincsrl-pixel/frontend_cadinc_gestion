-- =====================================================================
-- 20260928k — Contabilidad: tab `estados` (Estados contables) (2026-09-24)
--
-- Quien ya ve Sumas y saldos ve Estados (misma sensibilidad). Toca SOLO
-- `permisos.contabilidad.tabs`: no flags, ni personalizado, ni modulos (las
-- tabs no mueven modulos_de_permisos). Idempotente. Los perfiles con tabs
-- vacías o sin tabs ya ven todas. Al 24/09 alcanza a Mariana Dibe y a Leo
-- Leiro. Mismo criterio sobre `roles` (hoy ninguna plantilla tiene
-- contabilidad).
-- =====================================================================

update public.profiles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["estados"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'sumas-saldos'
   and not ((permisos #> '{contabilidad,tabs}') ? 'estados');

update public.roles
   set permisos = jsonb_set(permisos, '{contabilidad,tabs}', (permisos #> '{contabilidad,tabs}') || '["estados"]'::jsonb)
 where jsonb_typeof(permisos #> '{contabilidad,tabs}') = 'array'
   and jsonb_array_length(permisos #> '{contabilidad,tabs}') > 0
   and (permisos #> '{contabilidad,tabs}') ? 'sumas-saldos'
   and not ((permisos #> '{contabilidad,tabs}') ? 'estados');
