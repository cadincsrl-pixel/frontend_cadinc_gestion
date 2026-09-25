-- =====================================================================
-- 20260928s — Tesorería: reinicia la numeración MF (2026-09-24)
--
-- Por qué: al verificar la tanda 5 se consumió por error un número de
-- `tesoreria_movimientos_numero_seq` (un nextval en una consulta de control,
-- después de 20260928q). Las secuencias no vuelven atrás solas; como la tabla
-- sigue vacía, se reinicia para que el primer movimiento sea MF-000001.
-- Guardado: no hace nada si ya hay movimientos.
-- =====================================================================

select setval('public.tesoreria_movimientos_numero_seq', 1, false)
 where not exists (select 1 from public.tesoreria_movimientos);
